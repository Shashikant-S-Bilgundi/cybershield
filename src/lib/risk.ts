import type { Confidence, Criticality, Priority, Severity } from '@/types';

/** Risk = S × C × E × K × X (section 13 of the requirements). Weights are the proposed defaults. */
export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 10, high: 7, medium: 4, low: 1, info: 0 };
export const CRITICALITY_WEIGHT: Record<Criticality, number> = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.8 };
export const EXPOSURE_WEIGHT = { internet: 1.3, internal: 1.0 } as const;
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { confirmed: 1.0, likely: 0.8, possible: 0.5 };
export const EXPLOITED_WEIGHT = { yes: 1.5, no: 1.0 } as const;

export interface RiskInput {
  severity: Severity;
  criticality: Criticality;
  exposure: 'internet' | 'internal';
  confidence: Confidence;
  knownExploited: boolean;
}

export function riskScore(i: RiskInput): number {
  const raw =
    SEVERITY_WEIGHT[i.severity] *
    CRITICALITY_WEIGHT[i.criticality] *
    EXPOSURE_WEIGHT[i.exposure] *
    CONFIDENCE_WEIGHT[i.confidence] *
    (i.knownExploited ? EXPLOITED_WEIGHT.yes : EXPLOITED_WEIGHT.no);
  return Math.round(raw * 10) / 10;
}

export function priorityFor(score: number): Priority {
  if (score >= 10) return 'P1';
  if (score >= 6) return 'P2';
  if (score >= 3) return 'P3';
  return 'P4';
}

/** Days to remediate per priority (proposed SLA). */
export const SLA_DAYS: Record<Priority, number> = { P1: 2, P2: 7, P3: 30, P4: 90 };