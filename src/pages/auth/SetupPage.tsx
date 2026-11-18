import { useState, type FormEvent } from 'react';
import { api } from '@/api';
import type { LoginResult } from '@/types';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { AuthLayout } from './AuthLayout';
import { MfaStep } from './MfaStep';
import { passwordProblem } from './passwordRules';
import { useCompleteSignIn } from './useCompleteSignIn';

/** One-time setup: creates the first account. Everyone after this joins by invitation. */
export function SetupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [step, setStep] = useState<LoginResult | null>(null);
  const complete = useCompleteSignIn();
  const problem = passwordProblem(form.password, form.confirm);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      setStep(await api.setup({ name: form.name.trim(), email: form.email.trim(), password: form.password }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (step) {
    return (
      <AuthLayout title="Set up two-factor sign-in" subtitle={form.email}>
        <MfaStep result={step} onDone={complete} />
      </AuthLayout>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthLayout title="Set up ShieldOps" subtitle="Create the first account. You can invite the rest of the team once you're in.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your name">{(id) => <Input id={id} value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />}</Field>
        <Field label="Work email">{(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="username" required />}</Field>
        <Field label="Password" hint="At least 12 characters, with letters and numbers.">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />}
        </Field>
        <Field label="Confirm password" error={touched ? problem : null}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />}
        </Field>
        <InlineError error={error} />
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!form.name || !form.email}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}