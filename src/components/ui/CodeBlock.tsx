import { Copy } from 'lucide-react';
import { toast } from './toastStore';

export function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-line bg-sunken p-3 pr-10 font-mono text-xs leading-relaxed text-ink">{code}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(code).then(() => toast.success('Copied'))}
        className="absolute right-2 top-2 rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}