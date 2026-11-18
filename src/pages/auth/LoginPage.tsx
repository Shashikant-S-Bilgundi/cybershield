import { useState, type FormEvent } from 'react';
import { api, USE_MOCKS } from '@/api';
import type { LoginResult } from '@/types';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { AuthLayout } from './AuthLayout';
import { MfaStep } from './MfaStep';
import { useCompleteSignIn } from './useCompleteSignIn';

export function LoginPage() {
  const [email, setEmail] = useState(USE_MOCKS ? 'demo@shieldops.local' : '');
  const [password, setPassword] = useState(USE_MOCKS ? 'ShieldOps!2026' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [step, setStep] = useState<LoginResult | null>(null);
  const complete = useCompleteSignIn();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStep(await api.login(email, password));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (step) {
    return (
      <AuthLayout title={step.status === 'mfa_enroll' ? 'Set up two-factor sign-in' : 'Enter your code'} subtitle={email}>
        <MfaStep result={step} onDone={complete} onBack={() => setStep(null)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Access is by invitation from your IT team.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email">
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />}
        </Field>
        <Field label="Password">
          {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}
        </Field>
        <InlineError error={error} />
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Continue
        </Button>
        {USE_MOCKS && <p className="text-center text-xs text-muted">Demo mode: any 6-digit code except 000000 works for two-factor.</p>}
      </form>
    </AuthLayout>
  );
}