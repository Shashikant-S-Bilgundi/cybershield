import type { AssetType, Criticality, EnvironmentType, HealthState, Severity } from '@/types';

const TZ = 'Asia/Kolkata';

const valid = (value: string | null | undefined): value is string => !!value && !Number.isNaN(new Date(value).getTime());

export const formatDateTime = (value: string | null | undefined) =>
  valid(value) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(value)) : '—';

export const formatDate = (value: string | null | undefined) =>
  valid(value) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: TZ }).format(new Date(value)) : '—';

export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'Never';
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [365 * 864e5, 'year'],
    [30 * 864e5, 'month'],
    [864e5, 'day'],
    [36e5, 'hour'],
    [6e4, 'minute'],
  ];
  for (const [ms, unit] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      const label = `${n} ${unit}${n > 1 ? 's' : ''}`;
      return diff >= 0 ? `${label} ago` : `in ${label}`;
    }
  }
  return 'Just now';
}

export const daysUntil = (value: string) => Math.ceil((new Date(value).getTime() - Date.now()) / 864e5);

export const HEALTH_LABEL: Record<HealthState, string> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
  paused: 'Paused',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export const CRITICALITY_LABEL: Record<Criticality, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const ENV_TYPE_LABEL: Record<EnvironmentType, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  custom: 'Custom',
};

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  domain: 'Domain',
  website: 'Website or URL',
  api: 'API',
  server: 'Server',
  cloud: 'Cloud resource',
  database: 'Database',
  repository: 'Repository',
  image: 'Container image',
};

export const ASSET_PLACEHOLDER: Record<AssetType, string> = {
  domain: 'portal.example.com',
  website: 'https://portal.example.com',
  api: 'https://api.example.com/health',
  server: '203.0.113.10 or app1.example.com',
  cloud: 'arn:aws:ec2:ap-south-1:…',
  database: 'postgres://10.0.2.15:5432',
  repository: 'your-org/your-repo',
  image: 'ghcr.io/your-org/app:latest',
};