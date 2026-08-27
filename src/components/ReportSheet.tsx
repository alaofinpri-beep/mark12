import { forwardRef } from "react";
import type { Report } from "@/lib/attendance.server";

export const ROWS_PER_PAGE = 22;

export function paginate<T>(rows: T[], per = ROWS_PER_PAGE): T[][] {
  if (!rows.length) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return pages;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One A4 white sheet (794 x 1123 px at 96dpi). Deliberately styled with plain
 * hex colours so it exports identically to PDF / PNG on any device.
 */
export const ReportPage = forwardRef<
  HTMLDivElement,
  { report: Report; rows: Report["rows"]; pageIndex: number; pageCount: number; startNo: number }
>(function ReportPage({ report, rows, pageIndex, pageCount, startNo }, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: 794,
        minHeight: 1123,
        background: "#ffffff",
        color: "#111827",
        padding: "56px 56px 48px",
        boxSizing: "border-box",
        fontFamily: "Inter, Roboto, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ borderBottom: "3px solid #0ea5e9", paddingBottom: 18 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#0284c7", fontWeight: 700 }}>
          ATTENDANCE REPORT
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
          {report.session.course_name}
        </div>
        <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>
          {report.session.course_code ? `${report.session.course_code} · ` : ""}
          {report.sectionName}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginTop: 18,
          fontSize: 12,
          color: "#374151",
        }}
      >
        <div>
          <div style={{ color: "#9ca3af" }}>Started</div>
          <div style={{ fontWeight: 600 }}>{fmtDate(report.session.started_at)}</div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Closed</div>
          <div style={{ fontWeight: 600 }}>
            {report.session.closed_at ? fmtDate(report.session.closed_at) : "In progress"}
          </div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Total present</div>
          <div style={{ fontWeight: 600 }}>{report.presentCount}</div>
        </div>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 22,
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={th(52)}>#</th>
            <th style={{ ...th(), textAlign: "left" }}>Full name</th>
            <th style={th(150)}>Attendance time</th>
            <th style={th(96)}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`}>
              <td style={{ ...td(), textAlign: "center" }}>{startNo + i}</td>
              <td style={td()}>{r.name}</td>
              <td style={{ ...td(), textAlign: "center" }}>
                {new Date(r.markedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td style={{ ...td(), textAlign: "center", color: "#15803d", fontWeight: 600 }}>
                Present
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td style={{ ...td(), textAlign: "center", color: "#6b7280" }} colSpan={4}>
                No students marked present.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 28,
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#6b7280",
        }}
      >
        <span>Smart Attendance · GPS &amp; code verified</span>
        <span>
          Page {pageIndex + 1} of {pageCount}
        </span>
      </div>
    </div>
  );
});

function th(width?: number): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderBottom: "1px solid #cbd5e1",
    fontSize: 12,
    color: "#334155",
    fontWeight: 700,
    ...(width ? { width } : {}),
  };
}

function td(): React.CSSProperties {
  return {
    padding: "9px 12px",
    borderBottom: "1px solid #eef2f7",
  };
}
