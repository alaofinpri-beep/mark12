/**
 * Deterministic A4 report renderer.
 *
 * The report is painted directly onto a canvas with explicit coordinates, so the
 * downloaded PDF / PNG is pixel-identical everywhere and can never overlap,
 * scatter or spill outside the page (which is what happens when a live DOM tree
 * is rasterised).
 */

import type { Report } from "@/lib/attendance.server";

export const PAGE_W = 794; // A4 @96dpi
export const PAGE_H = 1123;

const M = 44; // page margin
const CONTENT_W = PAGE_W - M * 2; // 706

const INK = "#0f172a";
const SOFT = "#64748b";
const LINE = "#d8e0ea";
const HEAD_BG = "#eef4fb";
const ZEBRA = "#f8fbff";
const BRAND = "#0ea5e9";
const GREEN = "#15803d";

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

type Col = {
  key: "no" | "name" | "time" | "status" | "course" | "date";
  label: string;
  w: number;
  align: "left" | "center";
};

const COLS: Col[] = [
  { key: "no", label: "S/N", w: 42, align: "center" },
  { key: "name", label: "Student Name", w: 190, align: "left" },
  { key: "time", label: "Time", w: 78, align: "center" },
  { key: "status", label: "Status", w: 70, align: "center" },
  { key: "course", label: "Course / Department", w: 190, align: "left" },
  { key: "date", label: "Date", w: 136, align: "center" },
];

const ROW_H = 26;
const TABLE_HEAD_H = 30;
const FOOTER_TOP = PAGE_H - 58;
const TAIL_BLOCK_H = 178; // summary + signatures

/* ------------------------------------------------------------------ utils */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

class Painter {
  ctx: CanvasRenderingContext2D;
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  font(size: number, weight: number | string = 400) {
    this.ctx.font = `${weight} ${size}px ${FONT}`;
  }
  rect(x: number, y: number, w: number, h: number, fill: string) {
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x, y, w, h);
  }
  stroke(x: number, y: number, w: number, h: number, color = LINE) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  line(x1: number, y1: number, x2: number, y2: number, color = LINE) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1 + 0.5);
    this.ctx.lineTo(x2, y2 + 0.5);
    this.ctx.stroke();
  }
  /** Draws text clipped to `maxW`, adding an ellipsis instead of overflowing. */
  text(
    value: string,
    x: number,
    baselineY: number,
    opts: { maxW: number; align?: "left" | "center" | "right"; color?: string },
  ) {
    const { ctx } = this;
    let t = value ?? "";
    if (ctx.measureText(t).width > opts.maxW) {
      while (t.length > 1 && ctx.measureText(`${t}…`).width > opts.maxW) t = t.slice(0, -1);
      t = `${t}…`;
    }
    ctx.fillStyle = opts.color ?? INK;
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(t, x, baselineY);
    ctx.textAlign = "left";
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

/* ----------------------------------------------------------------- blocks */

function drawHeader(p: Painter, report: Report): number {
  const badge = 54;
  const gx = p.ctx.createLinearGradient(M, M, M + badge, M + badge);
  gx.addColorStop(0, "#38bdf8");
  gx.addColorStop(1, "#0284c7");
  p.roundRect(M, M, badge, badge, 12, gx);
  p.font(20, 800);
  p.text("SLT", M + badge / 2, M + badge / 2 + 7, { maxW: badge, align: "center", color: "#ffffff" });

  p.font(14, 800);
  p.text("SCIENCE LABORATORY TECHNOLOGY", M + badge + 16, M + 21, { maxW: CONTENT_W - badge - 16 });
  p.font(9.5, 600);
  p.text("ATTENDANCE MANAGEMENT SYSTEM", M + badge + 16, M + 37, {
    maxW: CONTENT_W - badge - 16,
    color: SOFT,
  });

  let y = M + badge + 34;
  p.font(24, 800);
  p.text("ATTENDANCE REPORT", PAGE_W / 2, y + 10, { maxW: CONTENT_W, align: "center" });
  y += 26;
  p.font(9.5, 400);
  p.text(
    "Official attendance record generated from the attendance management system.",
    PAGE_W / 2,
    y + 10,
    { maxW: CONTENT_W, align: "center", color: SOFT },
  );
  y += 30;

  // meta grid: 4 rows x (label | value | label | value)
  const rows: [string, string, string, string][] = [
    [
      "Course / Department",
      report.sectionName,
      "Date",
      fmtDate(report.session.started_at),
    ],
    [
      "Session",
      report.session.course_code
        ? `${report.session.course_name} (${report.session.course_code})`
        : report.session.course_name,
      "Radius",
      `${report.session.radius_m} m`,
    ],
    [
      "Started",
      fmtTime(report.session.started_at),
      "Closed",
      report.session.closed_at ? fmtTime(report.session.closed_at) : "In progress",
    ],
    ["Total Present", String(report.presentCount), "Verification", "GPS & code verified"],
  ];

  const rh = 28;
  const cw = [130, 243, 130, 203];
  rows.forEach((r, i) => {
    let x = M;
    const ry = y + i * rh;
    r.forEach((cell, ci) => {
      const isLabel = ci % 2 === 0;
      p.rect(x, ry, cw[ci]!, rh, isLabel ? HEAD_BG : "#ffffff");
      p.stroke(x, ry, cw[ci]!, rh);
      p.font(9.5, isLabel ? 700 : 500);
      p.text(cell, x + 10, ry + rh / 2 + 3.5, {
        maxW: cw[ci]! - 20,
        color: isLabel ? "#334155" : INK,
      });
      x += cw[ci]!;
    });
  });
  y += rows.length * rh + 26;

  p.font(10, 800);
  p.text("STUDENT ATTENDANCE", M, y, { maxW: CONTENT_W, color: "#334155" });
  return y + 12;
}

function drawTableHead(p: Painter, y: number) {
  p.rect(M, y, CONTENT_W, TABLE_HEAD_H, HEAD_BG);
  let x = M;
  COLS.forEach((c) => {
    p.stroke(x, y, c.w, TABLE_HEAD_H);
    p.font(9.5, 700);
    const tx = c.align === "center" ? x + c.w / 2 : x + 9;
    p.text(c.label, tx, y + TABLE_HEAD_H / 2 + 3.5, {
      maxW: c.w - 14,
      align: c.align === "center" ? "center" : "left",
      color: "#334155",
    });
    x += c.w;
  });
  return y + TABLE_HEAD_H;
}

function drawRow(
  p: Painter,
  y: number,
  index: number,
  values: Record<Col["key"], string>,
  zebra: boolean,
) {
  p.rect(M, y, CONTENT_W, ROW_H, zebra ? ZEBRA : "#ffffff");
  let x = M;
  COLS.forEach((c) => {
    p.stroke(x, y, c.w, ROW_H);
    const isStatus = c.key === "status";
    p.font(9.5, isStatus ? 700 : 400);
    const tx = c.align === "center" ? x + c.w / 2 : x + 9;
    p.text(values[c.key], tx, y + ROW_H / 2 + 3.5, {
      maxW: c.w - 14,
      align: c.align === "center" ? "center" : "left",
      color: isStatus ? GREEN : INK,
    });
    x += c.w;
  });
  return y + ROW_H;
}

function drawTail(p: Painter, y: number, report: Report) {
  // summary strip
  const h = 34;
  const parts: [string, string][] = [
    ["Attendance Summary", ""],
    ["Present", String(report.presentCount)],
    ["Status", report.session.closed_at ? "Closed" : "Open"],
    ["Generated", fmtDate(new Date().toISOString())],
  ];
  const cw = CONTENT_W / 4;
  parts.forEach(([label, value], i) => {
    const x = M + i * cw;
    p.rect(x, y, cw, h, i === 0 ? HEAD_BG : "#ffffff");
    p.stroke(x, y, cw, h);
    p.font(9.5, 700);
    if (value) {
      p.text(`${label}:`, x + 12, y + h / 2 + 3.5, { maxW: cw - 24, color: "#334155" });
      p.font(9.5, 500);
      p.text(value, x + cw - 12, y + h / 2 + 3.5, {
        maxW: cw / 2,
        align: "right",
        color: INK,
      });
    } else {
      p.text(label, x + 12, y + h / 2 + 3.5, { maxW: cw - 24, color: "#334155" });
    }
  });

  // signature block
  const sy = y + h + 26;
  const sh = 84;
  const boxes: [string, string][] = [
    ["Generated By", "Attendance System"],
    ["Verified By", ""],
    ["Lecturer's Signature", ""],
  ];
  const bw = CONTENT_W / 3;
  boxes.forEach(([label, value], i) => {
    const x = M + i * bw;
    p.stroke(x, sy, bw, sh);
    p.font(9.5, 700);
    p.text(label, x + 12, sy + 22, { maxW: bw - 24, color: "#334155" });
    p.font(9.5, 400);
    if (value) p.text(value, x + 12, sy + 40, { maxW: bw - 24, color: SOFT });
    else p.line(x + 12, sy + 40, x + bw - 12, sy + 40, "#94a3b8");
    p.font(9, 700);
    p.text("Date", x + 12, sy + 62, { maxW: bw - 24, color: "#334155" });
    p.line(x + 12, sy + 72, x + bw - 12, sy + 72, "#94a3b8");
  });
}

function drawFooter(p: Painter, page: number, total: number) {
  p.line(M, FOOTER_TOP, PAGE_W - M, FOOTER_TOP);
  p.font(9, 500);
  p.text("Smart Attendance · GPS & code verified", M, FOOTER_TOP + 20, {
    maxW: CONTENT_W / 2,
    color: SOFT,
  });
  p.text(`Page ${page} of ${total}`, PAGE_W - M, FOOTER_TOP + 20, {
    maxW: 160,
    align: "right",
    color: SOFT,
  });
}

/* ------------------------------------------------------------ pagination */

function paginateRows(report: Report) {
  const rows = report.rows;
  const firstTop = 470; // measured height of the header block
  const nextTop = M + 8;
  const limit = FOOTER_TOP - 18;

  const capacity = (top: number) => Math.max(1, Math.floor((limit - top - TABLE_HEAD_H) / ROW_H));

  const pages: { rows: Report["rows"]; top: number; startNo: number }[] = [];
  let i = 0;
  let first = true;
  do {
    const top = first ? firstTop : nextTop;
    const cap = capacity(top);
    const slice = rows.slice(i, i + cap);
    pages.push({ rows: slice, top, startNo: i + 1 });
    i += cap;
    first = false;
  } while (i < rows.length);

  // ensure the summary + signature block fits on the final page
  const last = pages[pages.length - 1]!;
  const usedBottom = last.top + TABLE_HEAD_H + last.rows.length * ROW_H;
  if (usedBottom + TAIL_BLOCK_H > limit) {
    pages.push({ rows: [], top: nextTop, startNo: rows.length + 1 });
  }
  return pages;
}

/* -------------------------------------------------------------- renderer */

export async function renderReportCanvases(report: Report, scale = 3): Promise<HTMLCanvasElement[]> {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const pages = paginateRows(report);
  const out: HTMLCanvasElement[] = [];

  pages.forEach((page, pi) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_W * scale);
    canvas.height = Math.round(PAGE_H * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";

    const p = new Painter(ctx);
    p.rect(0, 0, PAGE_W, PAGE_H, "#ffffff");

    let y = page.top;
    if (pi === 0) {
      y = drawHeader(p, report);
    } else {
      p.font(10, 800);
      p.text("STUDENT ATTENDANCE (CONTINUED)", M, y + 4, { maxW: CONTENT_W, color: "#334155" });
      y += 16;
    }

    y = drawTableHead(p, y);

    if (!page.rows.length && pages.length === 1) {
      p.rect(M, y, CONTENT_W, ROW_H * 2, "#ffffff");
      p.stroke(M, y, CONTENT_W, ROW_H * 2);
      p.font(10, 500);
      p.text("No students marked present.", PAGE_W / 2, y + ROW_H, {
        maxW: CONTENT_W - 24,
        align: "center",
        color: SOFT,
      });
      y += ROW_H * 2;
    } else {
      page.rows.forEach((r, i) => {
        y = drawRow(
          p,
          y,
          i,
          {
            no: String(page.startNo + i),
            name: r.name,
            time: fmtTime(r.markedAt),
            status: "Present",
            course: report.sectionName,
            date: fmtDate(r.markedAt),
          },
          i % 2 === 1,
        );
      });
    }

    if (pi === pages.length - 1) drawTail(p, y + 24, report);

    // brand rule at the very top
    p.rect(0, 0, PAGE_W, 5, BRAND);

    drawFooter(p, pi + 1, pages.length);
    out.push(canvas);
  });

  return out;
}
