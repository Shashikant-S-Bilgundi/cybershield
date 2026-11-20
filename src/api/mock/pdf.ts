import type { ReportDetail } from '@/types';

/**
 * A tiny PDF writer for the mock backend, so "Download PDF" works without a server.
 * The real backend renders a designed PDF; this one is plain text on A4 pages.
 */
const ascii = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7e]/g, '?');
const esc = (s: string) => ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach((w) => {
    if ((line + ' ' + w).trim().length > width) {
      if (line) lines.push(line);
      line = w;
    } else line = (line + ' ' + w).trim();
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

type Line = { text: string; bold?: boolean; size?: number; gap?: number };

export function reportToPdf(r: ReportDetail, meta: { generatedBy: string; scope: string }): Blob {
  const lines: Line[] = [
    { text: 'ShieldOps', bold: true, size: 9 },
    { text: r.title, bold: true, size: 18, gap: 8 },
    { text: `${meta.scope}. Covers ${r.from.slice(0, 10)} to ${r.to.slice(0, 10)}.`, size: 10 },
    { text: `Generated ${r.generatedAt.replace('T', ' ').slice(0, 16)} UTC by ${meta.generatedBy}. Secret values are masked.`, size: 10, gap: 14 },
  ];
  r.sections.forEach((s) => {
    lines.push({ text: s.title, bold: true, size: 13, gap: 10 });
    if (s.summary) wrap(s.summary, 95).forEach((l) => lines.push({ text: l, size: 10 }));
    s.metrics?.forEach((m) => lines.push({ text: `${m.label}: ${m.value}`, size: 10 }));
    if (s.table) {
      lines.push({ text: s.table.columns.join('  |  '), bold: true, size: 9, gap: 4 });
      s.table.rows.forEach((row) => wrap(row.join('  |  '), 110).forEach((l) => lines.push({ text: l, size: 9 })));
    }
    s.bullets?.forEach((b) => wrap(b, 92).forEach((l, i) => lines.push({ text: `${i === 0 ? '- ' : '  '}${l}`, size: 10 })));
  });

  // Lay lines out onto A4 pages (595 x 842 pt).
  const pages: string[] = [];
  let y = 800;
  let ops: string[] = [];
  lines.forEach((l) => {
    const size = l.size ?? 10;
    y -= (l.gap ?? 0) + size + 4;
    if (y < 50) {
      pages.push(ops.join('\n'));
      ops = [];
      y = 800 - size - 4;
    }
    ops.push(`BT /${l.bold ? 'F2' : 'F1'} ${size} Tf 50 ${y} Td (${esc(l.text)}) Tj ET`);
  });
  pages.push(ops.join('\n'));

  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add('');
  const pagesObj = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds = pages.map((content) => {
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}