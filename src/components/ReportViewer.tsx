import { useEffect, useState } from "react";
import { FileDown, Image as ImageIcon, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { renderReportCanvases } from "@/lib/report-render";
import { downloadImages, downloadPdf, reportFileName, shareReport } from "@/lib/report-export";
import type { Report } from "@/lib/attendance.server";

export function ReportViewer({
  report,
  onClose,
  onDelete,
}: {
  report: Report;
  onClose?: () => void;
  onDelete?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const name = reportFileName(report.session.course_name, report.session.course_code);

  // The preview shows the exact same pages that get downloaded.
  useEffect(() => {
    let alive = true;
    renderReportCanvases(report, 1.5)
      .then((canvases) => {
        if (alive) setPreviews(canvases.map((c) => c.toDataURL("image/png")));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [report]);

  async function run(kind: "pdf" | "image" | "share") {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadPdf(report, name);
      else if (kind === "image") await downloadImages(report, name);
      else {
        const res = await shareReport(report, name, `${report.session.course_name} attendance`);
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

      {onDelete ? (
        <Button
          variant="outline"
          className="tap-scale mt-2 h-10 w-full rounded-xl text-xs text-destructive"
          disabled={!!busy}
          onClick={() => {
            if (confirm("Delete this report and all its attendance records?")) onDelete();
          }}
        >
          <Trash2 className="size-4" /> Delete report
        </Button>
      ) : null}

      <div className="mt-4 max-h-[440px] overflow-y-auto rounded-2xl border border-border bg-muted p-2">
        {previews.length ? (
          previews.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Attendance report page ${i + 1}`}
              className="mb-2 w-full rounded-lg shadow-card"
            />
          ))
        ) : (
          <p className="py-10 text-center text-xs text-muted-foreground">Preparing preview…</p>
        )}
      </div>
    </section>
  );
}
