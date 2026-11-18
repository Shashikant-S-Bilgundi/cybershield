import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError, isReauthRequired } from '@/api';
import { useSession } from '@/store/session';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { ReauthContext, REAUTH_CANCELLED, type CriticalRunner } from './reauth';


/**
 * Wraps critical actions. When the backend answers REAUTH_REQUIRED, the user confirms
 * with their password or an authenticator code and the action is retried once.
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [value, setValue] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);
  const setReauthUntil = useSession((s) => s.setReauthUntil);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setValue('');
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
      const res = await api.reauth(mode === 'code' ? { code: value.trim() } : { password: value });
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
        description="This action changes something important for the whole team. Confirm once and you won't be asked again for 10 minutes."
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 rounded border border-line p-0.5 text-sm" role="tablist">
            {(['code', 'password'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setValue('');
                }}
                className={cn('rounded-[4px] py-1.5 font-medium', mode === m ? 'bg-sunken text-ink' : 'text-muted')}
              >
                {m === 'code' ? 'Authenticator code' : 'Password'}
              </button>
            ))}
          </div>
          <Field label={mode === 'code' ? '6-digit code' : 'Password'}>
            {(id) =>
              mode === 'code' ? (
                <Input id={id} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" className="font-mono tracking-[0.3em]" />
              ) : (
                <Input id={id} type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="current-password" autoFocus />
              )
            }
          </Field>
          <InlineError error={error} />
          <div className="flex justify-end gap-2">
            <Button onClick={cancel}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={mode === 'code' ? value.length !== 6 : !value}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </ReauthContext.Provider>
  );
}