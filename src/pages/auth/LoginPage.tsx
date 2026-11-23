import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, USE_MOCKS } from '@/api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { AuthLayout } from './AuthLayout';
import { useCompleteSignIn } from './useCompleteSignIn';

/** Why single sign-on sent you back here (?sso=… from the backend). */
const SSO_RETURN: Record<string, string> = {
  not_member: 'That account is not a ShieldOps member. Ask a teammate to invite you first.',
  domain: 'Use your work account. Only the company domain can sign in.',
  expired: 'The sign-in took too long or started in another browser. Try again.',
  cancelled: 'Sign-in was cancelled.',
  unverified: 'Your identity provider has not verified that email address.',
  invalid: 'The sign-in could not be verified. Try again, and tell IT if it keeps happening.',
  provider: 'The identity provider refused the sign-in. Check the SSO settings.',
  disabled: 'Single sign-on is turned off.',
};

export function LoginPage() {
  const [email, setEmail] = useState(USE_MOCKS ? 'demo@shieldops.local' : '');
  const [password, setPassword] = useState(USE_MOCKS ? 'ShieldOps!2026' : '');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const ssoReturn = SSO_RETURN[params.get('sso') ?? ''];
  const [error, setError] = useState<unknown>(ssoReturn ? new Error(ssoReturn) : null);
  const complete = useCompleteSignIn();
  const sso = useQuery({ queryKey: ['sso-config'], queryFn: api.getSsoConfig, retry: false });
  const ssoName = sso.data?.provider === 'entra' ? 'Microsoft' : 'Google Workspace';
  const showPassword = !sso.data?.enabled || sso.data.allowPasswordFallback;

  const startSso = async () => {
    setBusy(true);
    setError(null);
    try {
      complete(await api.ssoLogin(sso.data!.provider));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      complete(await api.login(email, password));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Access is by invitation from your IT team.">
      {sso.data?.enabled && (
        <div className="mb-5 space-y-3">
          <Button type="button" className="w-full" onClick={startSso} loading={busy}>
            Sign in with {ssoName}
          </Button>
          {!showPassword && <InlineError error={error} />}
          {showPassword && (
            <p className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" aria-hidden />
              or with your password
              <span className="h-px flex-1 bg-line" aria-hidden />
            </p>
          )}
        </div>
      )}
      {showPassword && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Work email">
            {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />}
          </Field>
          <Field label="Password">
            {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}
          </Field>
          <InlineError error={error} />
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}