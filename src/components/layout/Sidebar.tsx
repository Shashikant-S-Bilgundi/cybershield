import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { NAV } from './nav';

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center' : 'px-4')}>
        <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="7" className="fill-accent" />
          <path d="M8 17h4l2.5-6 3 11 2.5-5H24" fill="none" stroke="currentColor" className="text-accent-ink" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && <span className="text-[15px] font-semibold tracking-tight">ShieldOps</span>}
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && <p className="mb-1 px-4 text-xs font-medium text-muted">{group.label}</p>}
            <ul className="space-y-px px-2">
              {group.items.map((item) => {
                const to = item.to ?? `/soon/${item.slug}`;
                const later = !item.to;
                return (
                  <li key={item.label}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors',
                          collapsed && 'justify-center',
                          isActive ? 'bg-accent/10 font-medium text-ink' : later ? 'text-muted/80 hover:bg-sunken hover:text-muted' : 'text-muted hover:bg-sunken hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute inset-y-1 left-0 w-0.5 rounded bg-accent" aria-hidden />}
                          <item.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-accent')} aria-hidden />
                          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                          {!collapsed && later && <span className="text-2xs text-muted/70">Phase {item.phase}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}