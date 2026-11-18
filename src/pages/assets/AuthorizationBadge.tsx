import { cn } from '@/lib/cn';
import type { AssetAuthorization } from '@/types';

const label: Record<AssetAuthorization['status'], string> = {
  pending: 'Awaiting verification',
  verified: 'Verified',
  approved: 'Approved',
  failed: 'Verification failed',
};

const style: Record<AssetAuthorization['status'], string> = {
  pending: 'text-degraded',
  verified: 'text-up',
  approved: 'text-up',
  failed: 'text-down',
};

const method: Record<AssetAuthorization['method'], string> = {
  dns_txt: 'DNS TXT record',
  html_file: 'HTML file',
  approval: 'Approved with justification',
  internal_allowlist: 'Internal network allowlist',
};

export function AuthorizationBadge({ auth }: { auth: AssetAuthorization }) {
  return (
    <div>
      <p className={cn('text-sm font-medium', style[auth.status])}>{label[auth.status]}</p>
      <p className="text-xs text-muted">{method[auth.method]}</p>
    </div>
  );
}