import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { api } from '@/api';
import type { ExternalRef } from '@/types';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toastStore';

/** Shows the linked Jira issue, or a button to create one when Jira is connected. */
export function JiraButton({ type, id, existing }: { type: 'incident' | 'task'; id: string; existing?: ExternalRef }) {
  const qc = useQueryClient();
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const connected = integrations.data?.find((i) => i.type === 'jira')?.status === 'connected';
  const create = useMutation({
    mutationFn: () => api.createJiraIssue({ type, id }),
    onSuccess: (ref) => {
      ['incident', 'incidents', 'tasks'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Created ${ref.key} in Jira`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (existing)
    return (
      <a href={existing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
        Jira {existing.key} <span className="text-muted">({existing.status})</span>
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    );
  if (!connected) return null;
  return (
    <Button size="sm" onClick={() => create.mutate()} loading={create.isPending}>
      Create Jira issue
    </Button>
  );
}