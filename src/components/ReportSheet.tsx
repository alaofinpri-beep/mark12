import { forwardRef } from "react";
import type { Report } from "@/lib/attendance.server";

/** Rows that comfortably fit inside one A4 body without overflowing. */
export const ROWS_PER_PAGE = 18;

export function paginate<T>(rows: T[], per = ROWS_PER_PAGE): T[][] {
  if (!rows.length) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return pages;
}

const PAGE_W = 794; // A4 @96dpi
const PAGE_H = 1123;
const MARGIN = 40;
const TABLE_W = PAGE_W - MARGIN * 2; // 714

/** Fixed column widths — they must add up to TABLE_W exactly. */
const COLS = [
  { key: "no", label: "S/N", w: 40, align: "center" as const },
  { key: "name", label: "Full Name", w: 188, align: "left" as const },
  { key: "time", label: "Attendance Time", w: 96, align: "center" as const },
  { key: "status", label: "Status", w: 62, align: "center" as const },
  { key: "course", label: "Course / Department", w: 228, align: "left" as const },
  { key: "date", label: "Date", w: 100, align: "center" as const },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * One A4 white sheet. Plain hex colours and a fixed table layout so the export
 * to PDF / PNG is pixel-identical on every device and never scatters.
 */
export const ReportPage = forwardRef<
  HTMLDivElement,
  { report: Report; rows: Report["rows"]; pageIndex: number; pageCount: number; startNo: number }
>(function ReportPage({ report, rows, pageIndex, pageCount, startNo }, ref) {
  const course = report.session.course_code
    ? `${report.session.course_name} (${report.session.course_code})`
    : report.session.course_name;
  const dateLabel = fmtDate(report.session.started_at);

  return (
    <div
      ref={ref}
      style={{
        width: PAGE_W,
        height: PAGE_H,
        background: "#ffffff",
        color: "#111827",
        padding: MARGIN,
        boxSizing: "border-box",
        fontFamily: "Inter, Roboto, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{ borderBottom: "3px solid #0ea5e9", paddingBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#0284c7", fontWeight: 700 }}>
          ATTENDANCE REPORT
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, lineHeight: 1.2 }}>
          {course}
        </div>
        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 3 }}>{report.sectionName}</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 12,
          fontSize: 11,
          color: "#374151",
        }}
      >
        <Meta label="Date" value={dateLabel} w={150} />
        <Meta label="Started" value={fmtDateTime(report.session.started_at)} w={190} />
        <Meta
          label="Closed"
          value={report.session.closed_at ? fmtDateTime(report.session.closed_at) : "In progress"}
          w={190}
        />
        <Meta label="Total present" value={String(report.presentCount)} w={90} />
      </div>

      {/* table */}
      <table
        style={{
          width: TABLE_W,
          tableLayout: "fixed",
          borderCollapse: "collapse",
          marginTop: 16,
          fontSize: 11,
        }}
      >
        <colgroup>
          {COLS.map((c) => (
            <col key={c.key} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            {COLS.map((c) => (
              <th
                key={c.key}
                style={{
                  padding: "8px 8px",
                  borderTop: "1px solid #cbd5e1",
                  borderBottom: "1px solid #cbd5e1",
                  textAlign: c.align,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "#334155",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} style={{ background: i % 2 ? "#fbfdff" : "#ffffff" }}>
              <Cell align="center">{startNo + i}</Cell>
              <Cell align="left">{r.name}</Cell>
              <Cell align="center">{fmtTime(r.markedAt)}</Cell>
              <Cell align="center" color="#15803d" bold>
                Present
              </Cell>
              <Cell align="left">{report.sectionName}</Cell>
              <Cell align="center">{fmtDate(r.markedAt)}</Cell>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td
                colSpan={COLS.length}
                style={{
                  padding: "16px 8px",
                  textAlign: "center",
                  color: "#6b7280",
                  borderBottom: "1px solid #eef2f7",
                }}
              >
                No students marked present.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* footer */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 16,
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
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

function Meta({ label, value, w }: { label: string; value: string; w: number }) {
  return (
    <div style={{ width: w, overflow: "hidden" }}>
      <div style={{ color: "#9ca3af", fontSize: 10 }}>{label}</div>
      <div
        style={{
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Cell({
  children,
  align,
  color,
  bold,
}: {
  children: React.ReactNode;
  align: "left" | "center";
  color?: string;
  bold?: boolean;
}) {
  return (
    <td
      style={{
        padding: "7px 8px",
        borderBottom: "1px solid #eef2f7",
        textAlign: align,
        verticalAlign: "middle",
        lineHeight: 1.3,
        height: 30,
        boxSizing: "border-box",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        ...(color ? { color } : {}),
        ...(bold ? { fontWeight: 600 } : {}),
      }}
    >
      {children}
    </td>
  );
}
