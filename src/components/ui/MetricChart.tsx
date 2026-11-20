import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateTime } from '@/lib/format';

export interface MetricSeries {
  label: string;
  /** null leaves a gap, e.g. while a server was offline. */
  values: (number | null)[];
  /** Tailwind stroke class, e.g. stroke-accent */
  stroke: string;
  dashed?: boolean;
}

// The chart measures its own width, so text and lines render at true pixel size at any width.
const H = 160;
const PAD = { l: 56, r: 10, t: 12, b: 24 };

/** A small multi-line chart over time with three y ticks and a legend. */
export function MetricChart({
  times,
  series,
  format,
  threshold,
  ariaLabel,
  fixedMax,
  markers = [],
}: {
  times: string[];
  series: MetricSeries[];
  format: (v: number) => string;
  threshold?: { value: number; label: string };
  ariaLabel: string;
  /** Pin the top of the y axis, e.g. 100 for percentages. */
  fixedMax?: number;
  /** Vertical marks at a moment in time, e.g. a release. */
  markers?: { at: string; label: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(520);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (times.length < 2) return null;
    const max = fixedMax ?? Math.max(...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), threshold?.value ?? 0, 1) * 1.12;
    const x = (i: number) => PAD.l + (i / (times.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
    const paths = series.map((s) => {
      let d = '';
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
        pen = true;
      });
      return { ...s, d };
    });
    const t0 = Date.parse(times[0]);
    const t1 = Date.parse(times[times.length - 1]);
    const marks = markers
      .filter((m) => Date.parse(m.at) >= t0 && Date.parse(m.at) <= t1)
      .map((m) => ({ ...m, x: x(((Date.parse(m.at) - t0) / (t1 - t0)) * (times.length - 1)) }));
    return { paths, marks, ticks: [0, max / 2, max].map((v) => ({ v, y: y(v) })), ty: threshold ? y(threshold.value) : null };
  }, [times, series, threshold, fixedMax, W, markers]);

  return (
    <div ref={ref}>
      {!geo ? (
        <p className="py-10 text-center text-sm text-muted">Not enough data yet.</p>
      ) : (
        <figure>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={ariaLabel}>
            {geo.ticks.map((t) => (
              <g key={t.v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} className="stroke-line" />
                <text x={PAD.l - 6} y={t.y + 4} textAnchor="end" className="fill-muted text-[11px]">
                  {format(t.v)}
                </text>
              </g>
            ))}
            {geo.marks.map((m) => (
              <g key={m.at + m.label}>
                <line x1={m.x} x2={m.x} y1={PAD.t} y2={H - PAD.b} className="stroke-low" strokeDasharray="2 3" />
                <text x={m.x + 4} y={PAD.t + 10} className="fill-low text-[11px]">
                  {m.label}
                </text>
              </g>
            ))}
            {geo.ty !== null && threshold && (
              <g>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.ty} y2={geo.ty} className="stroke-degraded" strokeDasharray="4 4" />
                <text x={W - PAD.r} y={geo.ty - 4} textAnchor="end" className="fill-degraded text-[11px]">
                  {threshold.label}
                </text>
              </g>
            )}
            {geo.paths.map((p) => (
              <path key={p.label} d={p.d} fill="none" className={p.stroke} strokeWidth="1.75" strokeDasharray={p.dashed ? '5 4' : undefined} strokeLinejoin="round" />
            ))}
            <text x={PAD.l} y={H - 5} className="fill-muted text-[11px]">
              {formatDateTime(times[0])}
            </text>
            <text x={W - PAD.r} y={H - 5} textAnchor="end" className="fill-muted text-[11px]">
              {formatDateTime(times[times.length - 1])}
            </text>
          </svg>
          {series.length > 1 && (
            <figcaption className="mt-1 flex flex-wrap gap-4 pl-14 text-xs text-muted">
              {series.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <svg width="18" height="6" aria-hidden>
                    <line x1="0" x2="18" y1="3" y2="3" className={s.stroke} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} />
                  </svg>
                  {s.label}
                </span>
              ))}
            </figcaption>
          )}
        </figure>
      )}
    </div>
  );
}