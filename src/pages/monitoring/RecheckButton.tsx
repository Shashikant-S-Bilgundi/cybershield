import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toastStore';

/** Re-runs SSL, DNS, domain and header checks for one asset. */
export function RecheckButton({ assetId, label = 'Recheck' }: { assetId: string; label?: string }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => api.recheckAsset(assetId),
    onSuccess: () => {
      ['certificates', 'dns', 'domains', 'headers', 'audit-logs'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success('Checks finished');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => run.mutate()} loading={run.isPending} aria-label={`${label} now`}>
      {!run.isPending && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </Button>
  );
}