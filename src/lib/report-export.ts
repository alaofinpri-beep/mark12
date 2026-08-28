/** Browser-only helpers that turn the rendered A4 sheets into PDF / PNG / share. */

async function renderCanvases(pages: HTMLElement[]): Promise<HTMLCanvasElement[]> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const out: HTMLCanvasElement[] = [];
  for (const page of pages) {
    out.push(
      await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", useCORS: true }),
    );
  }
  return out;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png", 0.95),
  );
}

export async function buildPdfBlob(pages: HTMLElement[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const canvases = await renderCanvases(pages);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const w = 210;
  const h = 297;
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
  });
  return pdf.output("blob");
}

export async function downloadPdf(pages: HTMLElement[], filename: string) {
  saveBlob(await buildPdfBlob(pages), `${filename}.pdf`);
}

export async function downloadImages(pages: HTMLElement[], filename: string) {
  const canvases = await renderCanvases(pages);
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
  pages: HTMLElement[],
  filename: string,
  title: string,
): Promise<"shared" | "downloaded"> {
  const pdf = await buildPdfBlob(pages);
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
