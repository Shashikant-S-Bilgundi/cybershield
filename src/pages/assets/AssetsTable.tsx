import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { Asset } from '@/types';
import { ASSET_TYPE_LABEL } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';
import { ConfirmDialog } from '@/components/security/ConfirmDialog';
import { useCritical } from '@/components/security/reauth';
import { AuthorizationBadge } from './AuthorizationBadge';
import { VerificationModal } from './VerificationModal';

export function AssetsTable({ assets, showApplication = true }: { assets: Asset[]; showApplication?: boolean }) {
  const qc = useQueryClient();
  const critical = useCritical();
  const apps = useQuery({ queryKey: ['applications'], queryFn: api.listApplications });
  const [verifying, setVerifying] = useState<Asset | null>(null);
  const [approving, setApproving] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [justification, setJustification] = useState('');

  const appById = new Map((apps.data ?? []).map((a) => [a.id, a]));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const pause = useMutation({
    mutationFn: (a: Asset) => api.setAssetStatus(a.id, a.status === 'paused' ? 'active' : 'paused'),
    onSuccess: (a) => {
      refresh();
      toast.success(a.status === 'paused' ? `Monitoring paused for ${a.label}` : `Monitoring resumed for ${a.label}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const approve = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.approveAsset(id, text),
    onSuccess: (a) => {
      refresh();
      toast.success(`${a.label} approved`);
      setApproving(null);
    },
  });

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="table-base">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              {showApplication && <th>Application</th>}
              <th>Reachable from</th>
              <th>Authorization</th>
              <th>Monitoring</th>
              <th className="w-px" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const app = appById.get(a.applicationId);
              const env = app?.environments.find((e) => e.id === a.environmentId);
              const canVerify = (a.authorization.method === 'dns_txt' || a.authorization.method === 'html_file') && (a.authorization.status === 'pending' || a.authorization.status === 'failed');
              return (
                <tr key={a.id}>
                  <td className="max-w-xs">
                    <p className="font-medium">{a.label}</p>
                    <p className="truncate font-mono text-xs text-muted">{a.identifier}</p>
                  </td>
                  <td className="text-sm">{ASSET_TYPE_LABEL[a.type]}</td>
                  {showApplication && (
                    <td className="text-sm">
                      {app ? (
                        <Link to={`/applications/${app.id}`} className="hover:underline">
                          {app.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                      <p className="text-xs text-muted">{env?.name}</p>
                    </td>
                  )}
                  <td className="text-sm">{a.exposure === 'internet' ? 'Internet' : 'Internal network'}</td>
                  <td>
                    <AuthorizationBadge auth={a.authorization} />
                  </td>
                  <td className="text-sm">{a.status === 'paused' ? <span className="text-muted">Paused</span> : 'Active'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {canVerify && (
                        <Button size="sm" onClick={() => setVerifying(a)}>
                          Verify
                        </Button>
                      )}
                      <Menu
                        actions={[
                          ...(canVerify ? [{ label: 'Approve with justification', onSelect: () => (setJustification(''), setApproving(a)) }] : []),
                          { label: a.status === 'paused' ? 'Resume monitoring' : 'Pause monitoring', onSelect: () => pause.mutate(a) },
                          { label: 'Delete asset', danger: true, onSelect: () => setDeleting(a) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <VerificationModal asset={verifying} onClose={() => setVerifying(null)} />

      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        size="sm"
        title={`Approve ${approving?.label ?? ''}`}
        description="Use this when you can't add a DNS record or file. Everyone is notified, and the reason is kept in the audit log."
        footer={
          <>
            <Button onClick={() => setApproving(null)}>Cancel</Button>
            <Button variant="primary" loading={approve.isPending} disabled={justification.trim().length < 10} onClick={() => approving && approve.mutate({ id: approving.id, text: justification })}>
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Why is this authorized?">{(id) => <Textarea id={id} value={justification} onChange={(e) => setJustification(e.target.value)} autoFocus />}</Field>
          <InlineError error={approve.error} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.label ?? ''}?`}
        body="Its monitors and history stop updating. You can restore it within 30 days."
        actionLabel="Delete asset"
        confirmText="delete"
        onConfirm={() =>
          critical(() => api.deleteAsset(deleting!.id)).then(() => {
            refresh();
            toast.success('Asset deleted');
          })
        }
      />
    </>
  );
}