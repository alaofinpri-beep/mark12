import { useRef, useState } from "react";
import { FileDown, Image as ImageIcon, Share2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ReportPage, paginate } from "@/components/ReportSheet";
import { downloadImages, downloadPdf, reportFileName, shareReport } from "@/lib/report-export";
import type { Report } from "@/lib/attendance.server";

export function ReportViewer({ report, onClose }: { report: Report; onClose?: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pages = paginate(report.rows);
  const name = reportFileName(report.session.course_name, report.session.course_code);

  function sheets(): HTMLElement[] {
    return Array.from(holder.current?.querySelectorAll<HTMLElement>("[data-sheet]") ?? []);
  }

  async function run(kind: "pdf" | "image" | "share") {
    setBusy(kind);
    try {
      const els = sheets();
      if (kind === "pdf") await downloadPdf(els, name);
      else if (kind === "image") await downloadImages(els, name);
      else {
        const res = await shareReport(els, name, `${report.session.course_name} attendance`);
        if (res === "downloaded") toast.info("Sharing unavailable — the PDF was downloaded.");
      }
      if (kind !== "share") toast.success("Report saved");
    } catch {
      toast.error("Could not generate the report file.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{report.session.course_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {report.sectionName} · {report.presentCount} present
          </p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="tap-scale h-11 rounded-xl text-xs"
          disabled={!!busy}
          onClick={() => run("pdf")}
        >
          <FileDown className="size-4" /> PDF
        </Button>
        <Button
          variant="outline"
          className="tap-scale h-11 rounded-xl text-xs"
          disabled={!!busy}
          onClick={() => run("image")}
        >
          <ImageIcon className="size-4" /> Image
        </Button>
        <Button
          className="tap-scale h-11 rounded-xl bg-gradient-primary text-xs font-semibold text-primary-foreground shadow-float"
          disabled={!!busy}
          onClick={() => run("share")}
        >
          <Share2 className="size-4" /> Share
        </Button>
      </div>

      {/* Live A4 preview — scaled down to fit the phone, exported at full size. */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-muted p-2">
        <div className="max-h-[420px] overflow-y-auto">
          <div ref={holder} className="origin-top-left" style={{ width: 794 }}>
            <div
              style={{
                transform: "scale(var(--sheet-scale, 0.38))",
                transformOrigin: "top left",
                width: 794,
              }}
              className="[--sheet-scale:0.38] sm:[--sheet-scale:0.5]"
            >
              {pages.map((rows, i) => (
                <div key={i} data-sheet className="mb-3 shadow-card">
                  <ReportPage
                    report={report}
                    rows={rows}
                    pageIndex={i}
                    pageCount={pages.length}
                    startNo={i * rows.length + 1}
                  />
                </div>
              ))}
            </div>
            <div style={{ height: pages.length * 1123 * 0.38 - 400 }} />
          </div>
        </div>
      </div>
    </section>
  );
}
