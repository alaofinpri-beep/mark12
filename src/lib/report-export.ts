/** Browser-only helpers that turn a Report into a clean A4 PDF / PNG / share file. */

import { renderReportCanvases, PAGE_W, PAGE_H } from "@/lib/report-render";
import type { Report } from "@/lib/attendance.server";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png"));
}

export async function buildPdfBlob(report: Report): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const canvases = await renderReportCanvases(report, 3);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  // Fit the A4-proportioned canvas exactly onto the A4 page.
  const ratio = Math.min(pw / PAGE_W, ph / PAGE_H);
  const w = PAGE_W * ratio;
  const h = PAGE_H * ratio;
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pw - w) / 2, (ph - h) / 2, w, h);
  });
  return pdf.output("blob");
}

export async function downloadPdf(report: Report, filename: string) {
  saveBlob(await buildPdfBlob(report), `${filename}.pdf`);
}

export async function downloadImages(report: Report, filename: string) {
  const canvases = await renderReportCanvases(report, 3);
  for (let i = 0; i < canvases.length; i++) {
    const blob = await toBlob(canvases[i]!);
    saveBlob(blob, canvases.length > 1 ? `${filename}-page-${i + 1}.png` : `${filename}.png`);
  }
}

export function canShareFiles(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    !!navigator.share
  );
}

/** Shares the report to WhatsApp / any installed app via the OS share sheet. */
export async function shareReport(
  report: Report,
  filename: string,
  title: string,
): Promise<"shared" | "downloaded"> {
  const pdf = await buildPdfBlob(report);
  const file = new File([pdf], `${filename}.pdf`, { type: "application/pdf" });
  if (canShareFiles() && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text: title });
    return "shared";
  }
  saveBlob(pdf, `${filename}.pdf`);
  return "downloaded";
}

export function reportFileName(course: string, code: string | null) {
  const base = `${code || course}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `attendance-${base || "report"}`.toLowerCase();
}
