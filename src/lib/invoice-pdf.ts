import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type InvoicePdfData = {
  invoiceNumber: string;
  title: string;
  status: string;
  createdAt: Date;
  dueDate: Date | null;
  notes: string | null;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountRemaining: number;
  customerName: string;
  customerAddress: string;
  projectName: string;
  projectAddress: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; totalPrice: number }>;
  payments: Array<{ dateReceived: Date; method: string; amount: number; memo: string | null }>;
};

export function canAccessInvoicePdf(role: string, userId: number, assignedUserIds: number[]): boolean {
  return role === "admin" || assignedUserIds.includes(userId);
}

export function invoicePdfSections(data: InvoicePdfData): string[] {
  return [
    "I.S PAINTING / Business Manager",
    data.amountRemaining <= 0 ? "Painting Receipt" : "Painting Invoice",
    `Invoice ${data.invoiceNumber}`,
    data.customerName,
    data.customerAddress,
    data.projectName,
    data.projectAddress,
    `Subtotal ${money(data.subtotal)}`,
    data.tax > 0 ? `Tax ${money(data.tax)}` : "",
    `Total ${money(data.total)}`,
    `Payments received ${money(data.amountPaid)}`,
    `Balance due ${money(Math.max(0, data.amountRemaining))}`,
    data.notes || "",
  ].filter(Boolean);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(value);
}

function printable(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\r\n]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = printable(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      const chunks: string[] = [];
      let chunk = "";
      for (const character of word) {
        if (chunk && font.widthOfTextAtSize(`${chunk}${character}`, size) > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else chunk += character;
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    });
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words.shift()!;
    for (const word of words) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 48;
  let page!: PDFPage;
  let y = 0;

  const addPage = () => {
    page = document.addPage([width, height]);
    y = height - margin;
    page.drawText("I.S PAINTING", { x: margin, y, size: 18, font: bold, color: rgb(0.08, 0.32, 0.25) });
    page.drawText("Business Manager", { x: margin, y: y - 16, size: 9, font: regular, color: rgb(0.35, 0.4, 0.42) });
    y -= 42;
  };
  const ensure = (space: number) => {
    if (y - space < margin) addPage();
  };
  const drawWrapped = (text: string, x: number, maxWidth: number, size = 10, font = regular, lineHeight = 14) => {
    const lines = wrap(text, font, size, maxWidth);
    for (const line of lines) {
      ensure(lineHeight);
      page.drawText(line, { x, y, size, font, color: rgb(0.12, 0.15, 0.16) });
      y -= lineHeight;
    }
  };

  addPage();
  const documentTitle = data.amountRemaining <= 0 ? "PAINTING RECEIPT" : "PAINTING INVOICE";
  page.drawText(documentTitle, { x: 354, y: height - margin, size: 19, font: bold, color: rgb(0.08, 0.32, 0.25) });
  page.drawText(data.invoiceNumber, { x: 430, y: height - margin - 20, size: 10, font: regular });
  page.drawText(`Date: ${date(data.createdAt)}`, { x: 430, y: height - margin - 35, size: 9, font: regular });
  if (data.dueDate) page.drawText(`Due: ${date(data.dueDate)}`, { x: 430, y: height - margin - 50, size: 9, font: regular });

  page.drawText("BILL TO", { x: margin, y, size: 8, font: bold, color: rgb(0.38, 0.42, 0.44) });
  y -= 16;
  drawWrapped(data.customerName, margin, 230, 11, bold);
  if (data.customerAddress) drawWrapped(data.customerAddress, margin, 230, 9);
  y -= 8;
  page.drawText("PROJECT", { x: 320, y: height - 114, size: 8, font: bold, color: rgb(0.38, 0.42, 0.44) });
  page.drawText(data.projectName, { x: 320, y: height - 130, size: 11, font: bold });
  const projectLines = wrap(data.projectAddress, regular, 9, 240);
  projectLines.forEach((line, index) => page.drawText(line, { x: 320, y: height - 145 - index * 12, size: 9, font: regular }));
  y = Math.min(y, height - 178);

  drawWrapped(data.title, margin, width - margin * 2, 15, bold, 19);
  y -= 8;
  const drawTableHeader = () => {
    ensure(28);
    page.drawRectangle({ x: margin, y: y - 18, width: width - margin * 2, height: 24, color: rgb(0.08, 0.32, 0.25) });
    page.drawText("DESCRIPTION", { x: margin + 8, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("QTY", { x: 365, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("RATE", { x: 420, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("AMOUNT", { x: 500, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
    y -= 30;
  };
  drawTableHeader();
  for (const item of data.lineItems) {
    const pendingLines = wrap(item.description, regular, 9, 290);
    let firstChunk = true;
    while (pendingLines.length > 0) {
      if (y - 24 < margin) {
        addPage();
        drawTableHeader();
      }
      const linesAvailable = Math.max(1, Math.floor((y - margin - 8) / 12));
      const lines = pendingLines.splice(0, linesAvailable);
      const rowHeight = Math.max(24, lines.length * 12 + 8);
      lines.forEach((line, index) => page.drawText(line, { x: margin + 8, y: y - index * 12, size: 9, font: regular }));
      if (firstChunk) {
        page.drawText(String(item.quantity), { x: 365, y, size: 9, font: regular });
        page.drawText(money(item.unitPrice), { x: 420, y, size: 9, font: regular });
        page.drawText(money(item.totalPrice), { x: 500, y, size: 9, font: regular });
      }
      y -= rowHeight;
      page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 0.5, color: rgb(0.84, 0.86, 0.87) });
      firstChunk = false;
    }
  }

  ensure(110);
  const totalsX = 390;
  const drawTotal = (label: string, value: number, emphasized = false) => {
    page.drawText(label, { x: totalsX, y, size: emphasized ? 11 : 9, font: emphasized ? bold : regular });
    page.drawText(money(value), { x: 500, y, size: emphasized ? 11 : 9, font: emphasized ? bold : regular });
    y -= emphasized ? 19 : 15;
  };
  drawTotal("Subtotal", data.subtotal);
  if (data.tax > 0) drawTotal("Tax", data.tax);
  drawTotal("Total", data.total, true);
  drawTotal("Payments received", data.amountPaid);
  drawTotal("Balance due", Math.max(0, data.amountRemaining), true);

  if (data.payments.length > 0) {
    y -= 10;
    ensure(38);
    page.drawText("PAYMENT HISTORY", { x: margin, y, size: 9, font: bold, color: rgb(0.08, 0.32, 0.25) });
    y -= 16;
    for (const payment of data.payments) {
      drawWrapped(`${date(payment.dateReceived)}  ${payment.method.replaceAll("_", " ")}  ${money(payment.amount)}${payment.memo ? `  ${payment.memo}` : ""}`, margin, width - margin * 2, 9);
    }
  }
  if (data.notes) {
    y -= 8;
    ensure(34);
    page.drawText("NOTES", { x: margin, y, size: 9, font: bold, color: rgb(0.08, 0.32, 0.25) });
    y -= 16;
    drawWrapped(data.notes, margin, width - margin * 2, 9);
  }

  return document.save();
}
