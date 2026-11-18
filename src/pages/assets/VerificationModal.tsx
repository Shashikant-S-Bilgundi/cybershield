import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { api } from '@/api';
import type { Asset } from '@/types';
import { hostOf } from '@/lib/net';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/toastStore';

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded border border-line bg-sunken px-3 py-2">
        <code className="flex-1 break-all font-mono text-xs">{value}</code>
        <button
          type="button"
          className="text-muted hover:text-ink"
          aria-label={`Copy ${label}`}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copied'))}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Shows how to prove ownership of an asset, then checks it. */
export function VerificationModal({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const qc = useQueryClient();
  const verify = useMutation({
    mutationFn: (id: string) => api.verifyAsset(id),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`${a.label} verified`);
      onClose();
    },
  });

  if (!asset) return null;
  const host = hostOf(asset.identifier);
  const token = asset.authorization.token ?? '';
  const isDns = asset.authorization.method === 'dns_txt';

  return (
    <Modal
      open={!!asset}
      onClose={onClose}
      title={`Verify ${asset.label}`}
      description="ShieldOps only checks and scans assets you have proved you control."
      footer={
        <>
          <Button onClick={onClose}>Verify later</Button>
          <Button variant="primary" loading={verify.isPending} onClick={() => verify.mutate(asset.id)}>
            Check now
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {isDns ? (
          <>
            <p>Add this TXT record at your DNS provider, then select Check now. DNS changes can take a few minutes to appear.</p>
            <CopyRow label="Host" value={host} />
            <CopyRow label="Type" value="TXT" />
            <CopyRow label="Value" value={token} />
          </>
        ) : (
          <>
            <p>Upload a file with this name to the site's root folder so it loads at the address below, then select Check now.</p>
            <CopyRow label="File name" value={token} />
            <CopyRow label="Must load at" value={`https://${host}/${token}`} />
            <CopyRow label="File content" value={token.replace('.html', '')} />
          </>
        )}
        {asset.authorization.status === 'failed' && (
          <p className="rounded border border-down/30 bg-down/10 px-3 py-2 text-down">The last check could not find this. Confirm it is published, then check again.</p>
        )}
        <InlineError error={verify.error} />
      </div>
    </Modal>
  );
}