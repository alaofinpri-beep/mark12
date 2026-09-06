/** Deterministic, minimal A4 attendance report renderer. */

import type { Report } from "@/lib/attendance.server";

export const PAGE_W = 794; // A4 @96dpi
export const PAGE_H = 1123;

const M = 52;
const CONTENT_W = PAGE_W - M * 2;
const INK = "#111111";
const SOFT = "#666666";
const LINE = "#dddddd";
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';
const ROW_H = 27;
const TABLE_HEAD_H = 30;
const FIRST_TABLE_TOP = 218;
const NEXT_TABLE_TOP = 62;
const FOOTER_Y = PAGE_H - 48;

type Col = {
  key: "no" | "name" | "time" | "date";
  label: string;
  w: number;
  align: "left" | "center";
};

const COLS: Col[] = [
  { key: "no", label: "S/N", w: 52, align: "center" },
  { key: "name", label: "Student Name", w: 348, align: "left" },
  { key: "time", label: "Time", w: 116, align: "center" },
  { key: "date", label: "Date", w: 174, align: "center" },
];

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
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  font(size: number, weight: number | string = 400) {
    this.ctx.font = `${weight} ${size}px ${FONT}`;
  }

  line(x1: number, y: number, x2: number, color = LINE) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y + 0.5);
    this.ctx.lineTo(x2, y + 0.5);
    this.ctx.stroke();
  }

  text(
    value: string,
    x: number,
    baselineY: number,
    opts: { maxW: number; align?: "left" | "center" | "right"; color?: string },
  ) {
    const { ctx } = this;
    let text = value ?? "";
    if (ctx.measureText(text).width > opts.maxW) {
      while (text.length > 1 && ctx.measureText(`${text}…`).width > opts.maxW) {
        text = text.slice(0, -1);
      }
      text = `${text}…`;
    }
    ctx.fillStyle = opts.color ?? INK;
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, baselineY);
    ctx.textAlign = "left";
  }
}

function drawLabelValue(p: Painter, label: string, value: string, y: number) {
  p.font(10.5, 600);
  p.text(`${label}:`, M, y, { maxW: 118 });
  p.font(10.5, 400);
  p.text(value, M + 122, y, { maxW: CONTENT_W - 122 });
}

function drawHeader(p: Painter, report: Report, generatedDate: string) {
  p.font(21, 700);
  p.text("ATTENDANCE REPORT", M, 76, { maxW: CONTENT_W });

  const course = report.session.course_code
    ? `${report.session.course_name} (${report.session.course_code})`
    : report.session.course_name;
  drawLabelValue(p, "Course", course, 116);
  drawLabelValue(p, "Department / Level", report.sectionName, 140);
  drawLabelValue(p, "Date", generatedDate, 164);
  drawLabelValue(p, "Total Present", String(report.presentCount), 188);
}

function drawTableHead(p: Painter, y: number) {
  p.font(10, 600);
  let x = M;
  COLS.forEach((col) => {
    const tx = col.align === "center" ? x + col.w / 2 : x + 8;
    p.text(col.label, tx, y + 19, {
      maxW: col.w - 16,
      align: col.align,
    });
    x += col.w;
  });
  p.line(M, y + TABLE_HEAD_H, PAGE_W - M);
  return y + TABLE_HEAD_H;
}

function drawRow(
  p: Painter,
  y: number,
  values: Record<Col["key"], string>,
) {
  p.font(10, 400);
  let x = M;
  COLS.forEach((col) => {
    const tx = col.align === "center" ? x + col.w / 2 : x + 8;
    p.text(values[col.key], tx, y + 18, {
      maxW: col.w - 16,
      align: col.align,
    });
    x += col.w;
  });
  p.line(M, y + ROW_H, PAGE_W - M);
  return y + ROW_H;
}

function paginateRows(report: Report) {
  const capacity = (top: number) =>
    Math.max(1, Math.floor((FOOTER_Y - 24 - top - TABLE_HEAD_H) / ROW_H));
  const pages: { rows: Report["rows"]; top: number; startNo: number }[] = [];
  let index = 0;
  let first = true;

  do {
    const top = first ? FIRST_TABLE_TOP : NEXT_TABLE_TOP;
    const count = capacity(top);
    pages.push({ rows: report.rows.slice(index, index + count), top, startNo: index + 1 });
    index += count;
    first = false;
  } while (index < report.rows.length);

  return pages;
}

export async function renderReportCanvases(report: Report, scale = 3): Promise<HTMLCanvasElement[]> {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
    } catch {
      // System fonts remain available if the web font cannot load.
    }
  }

  const generatedDate = fmtDate(new Date().toISOString());
  const pages = paginateRows(report);

  return pages.map((page, pageIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_W * scale);
    canvas.height = Math.round(PAGE_H * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the report page.");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    const p = new Painter(ctx);
    if (pageIndex === 0) drawHeader(p, report, generatedDate);
    let y = drawTableHead(p, page.top);

    if (!page.rows.length) {
      p.font(10, 400);
      p.text("No students marked present.", M + 8, y + 22, {
        maxW: CONTENT_W - 16,
        color: SOFT,
      });
      p.line(M, y + ROW_H, PAGE_W - M);
    } else {
      page.rows.forEach((row, rowIndex) => {
        y = drawRow(p, y, {
          no: String(page.startNo + rowIndex),
          name: row.name,
          time: fmtTime(row.markedAt),
          date: fmtDate(row.markedAt),
        });
      });
    }

    p.font(9.5, 400);
    p.text(`Generated: ${generatedDate}`, M, FOOTER_Y, {
      maxW: CONTENT_W,
      color: SOFT,
    });
    return canvas;
  });
}