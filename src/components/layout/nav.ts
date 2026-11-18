import {
  Activity, Bell, BellRing, Boxes, Bug, CalendarClock, ClipboardCheck, Container, Database, FileCheck, FileText, Gauge,
  GitBranch, HeartPulse, KeyRound, KeySquare, Layers, LayoutDashboard, Lightbulb, ListChecks, Lock, LogIn, Package, Plug,
  ScrollText, Server, Settings, ShieldAlert, ShieldX, Siren, Sparkles, Users, Wrench, type LucideIcon,
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
      { label: 'Uptime checks', slug: 'uptime', phase: 2, icon: Activity, summary: 'HTTP, TCP and DNS monitors with uptime history and recheck before alerting.' },
      { label: 'Errors and exceptions', slug: 'errors', phase: 3, icon: Bug, summary: 'Errors from the ShieldOps SDK, grouped by fingerprint, with regression alerts.' },
      { label: 'API performance', slug: 'performance', phase: 3, icon: Gauge, summary: 'Request rate, error rate and p50/p95/p99 latency per route.' },
      { label: 'Servers and containers', slug: 'servers', phase: 4, icon: Server, summary: 'CPU, memory, disk, services and Docker containers from the server agent.' },
      { label: 'Databases', slug: 'databases', phase: 4, icon: Database, summary: 'Connection and latency checks for MongoDB, PostgreSQL, MySQL and Redis.' },
      { label: 'Heartbeats', slug: 'heartbeats', phase: 2, icon: HeartPulse, summary: 'Ping URLs for cron and background jobs, with alerts on missed runs.' },
    ],
  },
  {
    label: 'Security monitoring',
    items: [
      { label: 'Security events', slug: 'security-events', phase: 3, icon: ShieldAlert, summary: 'Login failures, 401/403 spikes and rate-limit hits sent by your apps.' },
      { label: 'Login activity', slug: 'login-activity', phase: 3, icon: LogIn, summary: 'Sign-ins to ShieldOps and to monitored applications.' },
      { label: 'SSL and DNS', slug: 'ssl-dns', phase: 2, icon: Lock, summary: 'Certificate validity and DNS record changes with diff history.' },
      { label: 'Domain expiry', slug: 'domain-expiry', phase: 2, icon: CalendarClock, summary: 'Daily RDAP checks with alerts at 60, 30 and 7 days.' },
      { label: 'Security headers', slug: 'security-headers', phase: 2, icon: FileCheck, summary: 'HSTS, CSP and other response headers on every website.' },
    ],
  },
  {
    label: 'Application security',
    items: [
      { label: 'Repositories', slug: 'repositories', phase: 5, icon: GitBranch, summary: 'Connected GitHub repositories and their scan history.' },
      { label: 'Secrets and credentials', slug: 'secrets', phase: 5, icon: KeyRound, summary: 'Exposed keys and passwords found by Gitleaks, always masked.' },
      { label: 'Vulnerabilities', slug: 'vulnerabilities', phase: 5, icon: ShieldX, summary: 'Known CVEs from OSV and Trivy, merged and risk-scored.' },
      { label: 'Dependency security', slug: 'dependencies', phase: 5, icon: Package, summary: 'Vulnerable packages and the versions that fix them.' },
      { label: 'Container images', slug: 'images', phase: 5, icon: Container, summary: 'Trivy scans of images from Docker Hub and GHCR.' },
    ],
  },
  {
    label: 'Security operations',
    items: [
      { label: 'Alerts', slug: 'alerts', phase: 2, icon: Bell, summary: 'Conditions that need attention now, with acknowledge and snooze.' },
      { label: 'Incidents', slug: 'incidents', phase: 6, icon: Siren, summary: 'Investigations that group alerts, findings and error groups.' },
      { label: 'Findings', slug: 'findings', phase: 2, icon: ListChecks, summary: 'Persistent weaknesses with severity, confidence and risk priority.' },
      { label: 'Remediation tasks', slug: 'remediation', phase: 6, icon: Wrench, summary: 'Fix tasks with SLA due dates and verification rechecks.' },
      { label: 'Recommendations', slug: 'recommendations', phase: 7, icon: Lightbulb, summary: 'Suggested fixes from rules and the AI analyst.' },
    ],
  },
  {
    label: 'Assets',
    items: [{ label: 'All assets', to: '/assets', icon: Layers }],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'AI security analyst', slug: 'ai-analyst', phase: 7, icon: Sparkles, summary: 'Plain-language explanations of findings and incidents.' },
      { label: 'Reports', slug: 'reports', phase: 7, icon: FileText, summary: 'Health, security and SLA reports as PDF.' },
      { label: 'Compliance readiness', slug: 'compliance', phase: 7, icon: ClipboardCheck, summary: 'How your controls map to the frameworks you choose.' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Integrations', slug: 'integrations', phase: 5, icon: Plug, summary: 'GitHub, SMTP, Slack and other connections.' },
      { label: 'Ingestion keys and agents', slug: 'ingestion', phase: 3, icon: KeySquare, summary: 'SDK keys and server agent tokens per environment.' },
      { label: 'Alert rules and channels', slug: 'alert-rules', phase: 2, icon: BellRing, summary: 'Thresholds, scopes and where notifications go.' },
      { label: 'Team', to: '/team', icon: Users },
      { label: 'Audit logs', to: '/audit-logs', icon: ScrollText },
      { label: 'System settings', to: '/settings', icon: Settings },
    ],
  },
];

export const findSoon = (slug: string) => NAV.flatMap((g) => g.items).find((i) => i.slug === slug);