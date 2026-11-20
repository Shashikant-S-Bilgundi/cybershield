import {
  Activity, Bell, BellRing, Boxes, Bug, CalendarClock, ClipboardCheck, Container, Database, FileCheck, FileText, Gauge,
  GitBranch, HeartPulse, KeyRound, KeySquare, Layers, LayoutDashboard, Lightbulb, ListChecks, Lock, LogIn, Package, Plug,
  Logs, Radar, Rocket, CloudCog, ScrollText, Server, Settings, ShieldAlert, ShieldX, Siren, Sparkles, Users, Wrench, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Route for built screens. */
  to?: string;
  /** Later-phase screens open a "coming in phase N" page at /soon/:slug. */
  slug?: string;
  phase?: number;
  summary?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Applications', to: '/applications', icon: Boxes },
    ],
  },
  {
    label: 'Operations monitoring',
    items: [
      { label: 'Uptime checks', to: '/monitors', icon: Activity },
      { label: 'Errors and exceptions', to: '/errors', icon: Bug },
      { label: 'API performance', to: '/performance', icon: Gauge },
      { label: 'Servers and containers', to: '/servers', icon: Server },
      { label: 'Databases', to: '/databases', icon: Database },
      { label: 'Heartbeats', to: '/heartbeats', icon: HeartPulse },
      { label: 'Releases', to: '/releases', icon: Rocket },
      { label: 'Logs', to: '/logs', icon: Logs },
    ],
  },
  {
    label: 'Security monitoring',
    items: [
      { label: 'Security events', to: '/security-events', icon: ShieldAlert },
      { label: 'Login activity', to: '/login-activity', icon: LogIn },
      { label: 'SSL and DNS', to: '/ssl-dns', icon: Lock },
      { label: 'Domain expiry', to: '/domain-expiry', icon: CalendarClock },
      { label: 'Security headers', to: '/security-headers', icon: FileCheck },
      { label: 'Cloud and identity', to: '/cloud-identity', icon: CloudCog },
    ],
  },
  {
    label: 'Application security',
    items: [
      { label: 'Repositories', to: '/repositories', icon: GitBranch },
      { label: 'Secrets and credentials', to: '/secrets', icon: KeyRound },
      { label: 'Vulnerabilities', to: '/vulnerabilities', icon: ShieldX },
      { label: 'Dependency security', to: '/dependencies', icon: Package },
      { label: 'Container images', to: '/images', icon: Container },
    ],
  },
  {
    label: 'Security operations',
    items: [
      { label: 'Alerts', to: '/alerts', icon: Bell },
      { label: 'Incidents', to: '/incidents', icon: Siren },
      { label: 'Findings', to: '/findings', icon: ListChecks },
      { label: 'Remediation tasks', to: '/remediation', icon: Wrench },
      { label: 'Anomalies', to: '/anomalies', icon: Radar },
      { label: 'Recommendations', to: '/recommendations', icon: Lightbulb },
    ],
  },
  {
    label: 'Assets',
    items: [{ label: 'All assets', to: '/assets', icon: Layers }],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'AI security analyst', to: '/ai-analyst', icon: Sparkles },
      { label: 'Reports', to: '/reports', icon: FileText },
      { label: 'Compliance readiness', to: '/compliance', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Integrations', to: '/integrations', icon: Plug },
      { label: 'Ingestion keys and agents', to: '/ingestion', icon: KeySquare },
      { label: 'Alert rules and channels', to: '/alert-rules', icon: BellRing },
      { label: 'Team', to: '/team', icon: Users },
      { label: 'Audit logs', to: '/audit-logs', icon: ScrollText },
      { label: 'System settings', to: '/settings', icon: Settings },
    ],
  },
];

export const findSoon = (slug: string) => NAV.flatMap((g) => g.items).find((i) => i.slug === slug);