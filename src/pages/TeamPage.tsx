import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Info, UserPlus } from 'lucide-react';
import { api } from '@/api';
import type { User } from '@/types';
import { useSession } from '@/store/session';
import { formatDate, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Menu } from '@/components/ui/Menu';
import { ErrorState, InlineError, Spinner } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { isReauthCancelled, useCritical } from '@/components/security/reauth';

export function TeamPage() {
  const qc = useQueryClient();
  const critical = useCritical();
  const me = useSession((s) => s.session?.user.id);
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers });
  const invites = useQuery({ queryKey: ['invites'], queryFn: api.listInvites });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<User | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['invites'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  };

  const invite = useMutation({
    mutationFn: (value: string) => critical(() => api.inviteUser(value)),
    onSuccess: (inv) => {
      refresh();
      setLink(inv.link);
      toast.success(`Invite sent to ${inv.email}`);
    },
  });

  const enable = useMutation({
    mutationFn: (u: User) => critical(() => api.setUserStatus(u.id, 'active')),
    onSuccess: (u) => {
      refresh();
      toast.success(`${u.name} can sign in again`);
    },
    onError: (e) => !isReauthCancelled(e) && toast.error((e as Error).message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeInvite(id),
    onSuccess: () => {
      refresh();
      toast.success('Invite revoked');
    },
  });

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate(email.trim());
  };

  const closeInvite = () => {
    setInviteOpen(false);
    setEmail('');
    setLink(null);
    invite.reset();
  };

  const userName = new Map((users.data ?? []).map((u) => [u.id, u.name]));
  const activeCount = (users.data ?? []).filter((u) => u.status === 'active').length;

  return (
    <>
      <PageHeader
        title="Team"
        description={`${activeCount} active ${activeCount === 1 ? 'member' : 'members'}.`}
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite someone
          </Button>
        }
      />

      <div className="mb-5 flex gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-muted">
          Everyone here has the same full access, so inviting, disabling and removing people asks you to confirm it's you, and the whole team is notified.
          ShieldOps always keeps at least one active member.
        </p>
      </div>

      {users.isLoading ? (
        <Spinner />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-base">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Two-factor</th>
                <th>Last sign-in</th>
                <th>Invited by</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>
                    <p className="font-medium">
                      {u.name} {u.id === me && <span className="text-xs font-normal text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="text-sm">{u.status === 'active' ? 'Active' : <span className="text-muted">Disabled</span>}</td>
                  <td className="text-sm">{u.mfaEnabled ? 'On' : <span className="text-degraded">Not set up</span>}</td>
                  <td className="text-sm" title={formatDate(u.lastLoginAt)}>
                    {timeAgo(u.lastLoginAt)}
                  </td>
                  <td className="text-sm text-muted">{u.invitedBy ? userName.get(u.invitedBy) ?? 'Former member' : 'First user'}</td>
                  <td>
                    {u.id !== me && (
                      <Menu
                        actions={[
                          u.status === 'active'
                            ? { label: 'Disable sign-in', onSelect: () => setDisabling(u) }
                            : { label: 'Enable sign-in', onSelect: () => enable.mutate(u) },
                          { label: 'Remove from ShieldOps', danger: true, onSelect: () => setRemoving(u) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(invites.data?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Pending invites</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {invites.data!.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{i.email}</p>
                  <p className="text-xs text-muted">
                    Invited by {userName.get(i.invitedBy) ?? 'a former member'}, expires {timeAgo(i.expiresAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={inviteOpen}
        onClose={closeInvite}
        size="sm"
        title={link ? 'Invite sent' : 'Invite someone'}
        description={link ? undefined : 'They get an email with a link that works for 72 hours, and join with the same full access as you.'}
        footer={
          link ? (
            <Button variant="primary" onClick={closeInvite}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={closeInvite}>Cancel</Button>
              <Button type="submit" form="invite-form" variant="primary" loading={invite.isPending} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
                Send invite
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="space-y-2 text-sm">
            <p>If the email doesn't arrive, share this link directly. It works once.</p>
            <div className="flex items-center gap-2 rounded border border-line bg-sunken px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs">{link}</code>
              <button type="button" aria-label="Copy invite link" className="text-muted hover:text-ink" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <form id="invite-form" onSubmit={submitInvite} className="space-y-3">
            <Field label="Work email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />}</Field>
            {invite.error && !isReauthCancelled(invite.error) && <InlineError error={invite.error} />}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!disabling}
        onClose={() => setDisabling(null)}
        title={`Disable ${disabling?.name ?? ''}?`}
        body="They are signed out everywhere straight away. Their open incidents and tasks are flagged for reassignment. You can enable them again later."
        actionLabel="Disable sign-in"
        onConfirm={() =>
          critical(() => api.setUserStatus(disabling!.id, 'disabled')).then(() => {
            refresh();
            toast.success(`${disabling!.name} disabled`);
          })
        }
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        body="They lose access permanently and need a new invite to come back. Their past actions stay in the audit log."
        actionLabel="Remove member"
        confirmText="remove"
        onConfirm={() =>
          critical(() => api.removeUser(removing!.id)).then(() => {
            refresh();
            toast.success(`${removing!.name} removed`);
          })
        }
      />
    </>
  );
}