import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError, isReauthRequired } from '@/api';
import { useSession } from '@/store/session';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { ReauthContext, REAUTH_CANCELLED, type CriticalRunner } from './reauth';

/**
 * Wraps critical actions. When the backend answers REAUTH_REQUIRED, the user enters
 * their password again and the action is retried once.
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);
  const setReauthUntil = useSession((s) => s.setReauthUntil);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setPassword('');
        setError(null);
        setOpen(true);
      }),
    [],
  );

  const run: CriticalRunner = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (!isReauthRequired(e)) throw e;
        await ask();
        return fn();
      }
    },
    [ask],
  );

  const cancel = () => {
    setOpen(false);
    pending.current?.reject(new ApiError(0, REAUTH_CANCELLED, 'Cancelled'));
    pending.current = null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.reauth({ password });
      setReauthUntil(res.reauthUntil);
      setOpen(false);
      pending.current?.resolve();
      pending.current = null;
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReauthContext.Provider value={run}>
      {children}
      <Modal
        open={open}
        onClose={cancel}
        size="sm"
        title="Confirm it's you"
        description="This action changes something important for the whole team. Enter your password once and you won't be asked again for 10 minutes."
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Password">
            {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />}
          </Field>
          <InlineError error={error} />
          <div className="flex justify-end gap-2">
            <Button onClick={cancel}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!password}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </ReauthContext.Provider>
  );
}