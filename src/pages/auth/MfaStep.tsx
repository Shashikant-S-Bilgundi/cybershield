import { useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/api';
import type { LoginResult, Session } from '@/types';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';

/** Second step of every sign-in: enter a TOTP code, or enrol first if the account has no MFA yet. */
export function MfaStep({ result, onDone, onBack }: { result: LoginResult; onDone: (s: Session) => void; onBack?: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api.verifyMfa(result.challengeId, code));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {result.status === 'mfa_enroll' && (
        <div className="space-y-3 rounded border border-line bg-sunken/60 p-4 text-sm">
          <p>
            ShieldOps needs two-factor sign-in for every account. Scan this code with an authenticator app such as Google Authenticator,
            Microsoft Authenticator or 1Password.
          </p>
          <div className="flex justify-center rounded bg-white p-3">
            <QRCodeSVG value={result.enrollment.otpauthUrl} size={156} />
          </div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Can't scan? Enter this key instead</summary>
            <code className="mt-2 block break-all font-mono text-ink">{result.enrollment.secret}</code>
          </details>
        </div>
      )}
      <Field label="6-digit code" hint={result.status === 'mfa_required' ? 'Open your authenticator app and enter the current code.' : undefined}>
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            className="font-mono text-base tracking-[0.35em]"
          />
        )}
      </Field>
      <InlineError error={error} />
      <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.length !== 6}>
        {result.status === 'mfa_enroll' ? 'Turn on two-factor and sign in' : 'Verify and sign in'}
      </Button>
      {onBack && (
        <button type="button" onClick={onBack} className="w-full text-center text-xs text-muted hover:text-ink">
          Use a different account
        </button>
      )}
    </form>
  );
}