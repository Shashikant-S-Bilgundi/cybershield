import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface TabItem {
  to: string;
  label: string;
  end?: boolean;
}

export function Tabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}