import { api } from '@/api';

/** Fetches the PDF and saves it with a readable file name. */
export async function downloadReport(id: string, title: string, to: string) {
  const blob = await api.downloadReportPdf(id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ShieldOps ${title.replace(/[^\w ]+/g, '')} ${to.slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}