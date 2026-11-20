import { useMemo } from 'react';
import { formatDateTime, formatMs } from '@/lib/format';
import type { CheckResult } from '@/types';

const W = 760;
const H = 200;
const PAD = { l: 48, r: 12, t: 12, b: 24 };

/**
 * Response time over the visible checks. Failed checks have no latency, so they show as
 * red bands instead of a line; slow checks sit above the dashed 2,000 ms threshold.
 */
export function LatencyChart({ results, thresholdMs = 2000 }: { results: CheckResult[]; thresholdMs?: number }) {
  const geo = useMemo(() => {
    if (results.length < 2) return null;
    const t0 = new Date(results[0].at).getTime();
    const t1 = new Date(results[results.length - 1].at).getTime();
    const span = Math.max(1, t1 - t0);
    const maxLatency = Math.max(...results.map((r) => r.latencyMs ?? 0), 1);
    const yMax = Math.max(maxLatency * 1.15, maxLatency < thresholdMs * 0.5 ? maxLatency * 1.3 : thresholdMs * 1.1);
    const x = (at: string) => PAD.l + ((new Date(at).getTime() - t0) / span) * (W - PAD.l - PAD.r);
    const y = (ms: number) => PAD.t + (1 - ms / yMax) * (H - PAD.t - PAD.b);
    const step = (W - PAD.l - PAD.r) / Math.max(1, results.length - 1);

    let d = '';
    let pen = false;
    results.forEach((r) => {
      if (r.latencyMs === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(r.at).toFixed(1)} ${y(r.latencyMs).toFixed(1)}`;
      pen = true;
    });

    const ticks = [0, yMax / 2, yMax].map((v) => ({ v, y: y(v) }));
    const failed = results.filter((r) => r.status === 'down' || r.status === 'unknown').map((r) => ({ x: x(r.at) - step / 2, w: Math.max(step, 2), status: r.status, at: r.at }));
    const showThreshold = thresholdMs < yMax;
    return { d, ticks, failed, y, showThreshold, first: results[0].at, last: results[results.length - 1].at };
  }, [results, thresholdMs]);

  if (!geo) return <p className="py-10 text-center text-sm text-muted">Not enough checks to draw a chart yet.</p>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Response time for recent checks">
      {geo.ticks.map((t) => (
        <g key={t.v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} className="stroke-line" strokeWidth="1" />
          <text x={PAD.l - 6} y={t.y + 4} textAnchor="end" className="fill-muted text-[10px]">
            {formatMs(Math.round(t.v))}
          </text>
        </g>
      ))}
      {geo.failed.map((f) => (
        <rect key={f.at} x={f.x} y={PAD.t} width={f.w} height={H - PAD.t - PAD.b} className={f.status === 'down' ? 'fill-down/25' : 'fill-unknown/20'}>
          <title>{`${formatDateTime(f.at)}: ${f.status === 'down' ? 'failed' : 'not checked'}`}</title>
        </rect>
      ))}
      {geo.showThreshold && (
        <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(thresholdMs)} y2={geo.y(thresholdMs)} className="stroke-degraded" strokeDasharray="4 4" strokeWidth="1" />
      )}
      <path d={geo.d} fill="none" className="stroke-accent" strokeWidth="1.75" strokeLinejoin="round" />
      <text x={PAD.l} y={H - 6} className="fill-muted text-[10px]">
        {formatDateTime(geo.first)}
      </text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-muted text-[10px]">
        {formatDateTime(geo.last)}
      </text>
    </svg>
  );
}