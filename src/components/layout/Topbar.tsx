import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Monitor, Moon, PanelLeft, ShieldCheck, Sun } from 'lucide-react';
import { api } from '@/api';
import { useSession } from '@/store/session';
import { usePreferences } from '@/store/preferences';
import { cn } from '@/lib/cn';
import { ScopePicker } from './ScopePicker';

function useMinutesLeft(until: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { session, setSession } = useSession();
  const { theme, setTheme, toggleSidebar } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const minutesLeft = useMinutesLeft(session?.reauthUntil);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const signOut = async () => {
    await api.logout();
    qc.clear();
    setSession(null);
    navigate('/login');
  };

  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const initials = session?.user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-4">
      <button type="button" onClick={onOpenMobileNav} className="rounded p-1.5 text-muted hover:bg-sunken lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <button type="button" onClick={toggleSidebar} className="hidden rounded p-1.5 text-muted hover:bg-sunken lg:block" aria-label="Collapse or expand navigation">
        <PanelLeft className="h-4 w-4" />
      </button>
      <ScopePicker />
      <div className="ml-auto flex items-center gap-1">
        {minutesLeft > 0 && (
          <span className="hidden items-center gap-1.5 rounded border border-up/30 bg-up/10 px-2 py-1 text-xs text-up md:inline-flex" title="Critical actions won't ask you to confirm again until this runs out">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Confirmed for {minutesLeft} min
          </span>
        )}
        <button type="button" onClick={() => setTheme(nextTheme)} className="rounded p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title={`Theme: ${theme}`}>
          <ThemeIcon className="h-4 w-4" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink hover:ring-2 hover:ring-line"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            {initials}
          </button>
          <div className={cn('absolute right-0 mt-2 w-56 rounded-lg border border-line bg-surface p-1 shadow-lg', !menuOpen && 'hidden')} role="menu">
            <div className="border-b border-line px-3 py-2">
              <p className="truncate text-sm font-medium">{session?.user.name}</p>
              <p className="truncate text-xs text-muted">{session?.user.email}</p>
            </div>
            <button type="button" role="menuitem" onClick={signOut} className="mt-1 flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-ink hover:bg-sunken">
              <LogOut className="h-4 w-4 text-muted" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}