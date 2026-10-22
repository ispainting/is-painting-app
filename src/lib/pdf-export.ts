import type { PDFFont } from "pdf-lib";

export type PdfTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type PdfExportDocument = {
  title: string;
  generatedAt: Date;
  dateRange: string;
  filters: Array<[string, string]>;
  recordCount: number;
  summary: Array<[string, string]>;
  tables: PdfTable[];
  definitions?: string[];
};

const zone = "America/New_York";
export const pdfCurrency = (value: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0));
export const pdfNumber = (value: unknown) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
export function pdfDate(value: Date | string | null | undefined, includeTime = false): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "short", day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } as const : {}),
  }).format(new Date(value));
}

export function pdfFilename(title: string, generatedAt: Date): string {
  const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "report";
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(generatedAt);
  return `is-painting-${slug}-${date}.pdf`;
}

function printable(text: string, font: PDFFont): string {
  return Array.from(text.replace(/\t/g, " ")).map((character) => {
    if (character === "\n" || character === "\r") return character;
    try { font.encodeText(character); return character; }
    catch { throw new Error("This PDF contains characters unsupported by the built-in font. Please use a supported spelling before exporting."); }
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(text, font).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function buildExportPdf(data: PdfExportDocument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  if (data.tables.some(table => !table.columns.length || table.rows.some(row => row.length !== table.columns.length))) {
    throw new Error("Invalid PDF table: each row must match its columns.");
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle(data.title);
  pdf.setAuthor("I.S Painting Corp");
  pdf.setCreationDate(data.generatedAt);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 842, height = 595, margin = 30, bottom = 42, lineHeight = 12;
  let page = pdf.addPage([width, height]);
  let y = 0;
  const text = (value: string, x: number, at: number, size = 9, strong = false) => {
    const font = strong ? bold : regular;
    page.drawText(printable(value, font), { x, y: at, size, font, color: rgb(0.1, 0.15, 0.2) });
  };
  const newPage = (add = true) => {
    if (add) page = pdf.addPage([width, height]);
    text("I.S Painting Corp", margin, height - 30, 15, true);
    y = height - 48;
    for (const line of wrap(data.title, bold, 11, width - margin * 2)) {
      text(line, margin, y, 11, true); y -= 14;
    }
    text(`Generated ${pdfDate(data.generatedAt, true)} | America/New_York`, margin, y);
    y -= 22;
  };
  const paragraph = (value: string, strong = false) => {
    for (const line of wrap(value, strong ? bold : regular, 9, width - margin * 2)) {
      if (y - lineHeight < bottom) newPage();
      text(line, margin, y, 9, strong); y -= lineHeight;
    }
    y -= 4;
  };
  newPage(false);
  paragraph(`Selected date range: ${data.dateRange}`);
  paragraph(`Active filters: ${data.filters.length ? data.filters.map(([key, value]) => `${key}: ${value || "All"}`).join(" | ") : "None"}`);
  paragraph(`Record count: ${data.recordCount}`, true);
  for (const [label, value] of data.summary) paragraph(`${label}: ${value}`);
  for (const table of data.tables) {
    const colWidth = (width - margin * 2) / table.columns.length;
    const headings = table.columns.map(column => wrap(column, bold, 8, colWidth - 10));
    const headingHeight = Math.max(...headings.map(lines => lines.length)) * lineHeight + 10;
    if (headingHeight > 180) throw new Error("PDF table headings are too long.");
    const header = () => {
      paragraph(table.title, true);
      page.drawRectangle({ x: margin, y: y - headingHeight, width: width - margin * 2, height: headingHeight, color: rgb(0.92, 0.94, 0.96) });
      headings.forEach((lines, index) => lines.forEach((line, offset) => text(line, margin + index * colWidth + 5, y - 12 - offset * lineHeight, 8, true)));
      y -= headingHeight;
    };
    const continuation = () => { newPage(); header(); };
    if (y < bottom + headingHeight + 50) newPage();
    header();
    if (!table.rows.length) { paragraph("No records found."); continue; }
    for (const row of table.rows) {
      const cells = row.map(cell => wrap(cell, regular, 8, colWidth - 10));
      let offset = 0;
      const length = Math.max(...cells.map(lines => lines.length));
      while (offset < length) {
        let available = Math.floor((y - bottom - 10) / lineHeight);
        if (available < 1) { continuation(); available = Math.floor((y - bottom - 10) / lineHeight); }
        const count = Math.min(available, length - offset);
        cells.forEach((lines, index) => lines.slice(offset, offset + count).forEach((line, lineIndex) =>
          text(line, margin + index * colWidth + 5, y - 12 - lineIndex * lineHeight, 8)));
        y -= count * lineHeight + 8;
        page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, color: rgb(0.85, 0.87, 0.9), thickness: 0.5 });
        offset += count;
        if (offset < length) continuation();
      }
    }
    y -= 14;
  }
  for (const definition of data.definitions ?? []) paragraph(definition);
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    page = p;
    text("Confidential — Internal Use Only", margin, 19, 8);
    text(`Page ${index + 1} of ${pages.length}`, width - 100, 19, 8);
  });
  return pdf.save();
}
