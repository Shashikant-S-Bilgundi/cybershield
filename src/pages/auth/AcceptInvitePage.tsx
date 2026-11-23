import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { InlineError, Spinner } from '@/components/ui/States';
import { AuthLayout } from './AuthLayout';
import { passwordProblem } from './passwordRules';
import { useCompleteSignIn } from './useCompleteSignIn';

export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.getInvite(token), retry: false });
  const [form, setForm] = useState({ name: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const complete = useCompleteSignIn();
  const problem = passwordProblem(form.password, form.confirm);

  if (invite.isLoading) return <AuthLayout title="Join ShieldOps"><Spinner /></AuthLayout>;
  if (invite.error) {
    return (
      <AuthLayout title="Invite not valid">
        <InlineError error={invite.error} />
        <Link to="/login" className="mt-4 block text-center text-sm text-accent hover:underline">
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      complete(await api.acceptInvite(token, { name: form.name.trim(), password: form.password }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthLayout title="Join ShieldOps" subtitle={<>You were invited as <span className="font-medium text-ink">{invite.data?.email}</span>.</>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your name">{(id) => <Input id={id} value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />}</Field>
        <Field label="Password" hint="At least 12 characters, with letters and numbers.">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />}
        </Field>
        <Field label="Confirm password" error={touched ? problem : null}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />}
        </Field>
        <InlineError error={error} />
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!form.name}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}