import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export const INVOICE_LOGO_ASSET = "public/is-painting-logo2.png";
export const INVOICE_PRIMARY_COLOR = "#1d4ed8";

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
    "I.S PAINTING",
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

export async function buildInvoicePdf(data: InvoicePdfData, logoBytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await document.embedPng(logoBytes);
  const width = 612;
  const height = 792;
  const margin = 42;
  const blue = rgb(29 / 255, 78 / 255, 216 / 255);
  const navy = rgb(31 / 255, 53 / 255, 88 / 255);
  const muted = rgb(0.38, 0.42, 0.48);
  const rule = rgb(0.86, 0.89, 0.93);
  let page!: PDFPage;
  let y = 0;
  let pageNumber = 0;

  const drawLogo = (image: PDFImage, x: number, top: number, targetWidth: number) => {
    const dimensions = image.scale(targetWidth / image.width);
    page.drawImage(image, { x, y: top - dimensions.height, width: dimensions.width, height: dimensions.height });
    return dimensions.height;
  };

  const drawRight = (text: string, right: number, baseline: number, size: number, font = regular, color = navy) => {
    page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y: baseline, size, font, color });
  };

  const addPage = () => {
    page = document.addPage([width, height]);
    pageNumber += 1;
    if (pageNumber === 1) {
      drawLogo(logo, margin, height - 28, 112);
      y = height - 122;
    } else {
      drawLogo(logo, margin, height - 24, 60);
      drawRight(`${data.invoiceNumber}  |  CONTINUED`, width - margin, height - 52, 8, bold, muted);
      page.drawLine({ start: { x: margin, y: height - 68 }, end: { x: width - margin, y: height - 68 }, thickness: 1, color: blue });
      y = height - 86;
    }
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
  drawRight(documentTitle, width - margin, height - 48, 18, bold, blue);
  drawRight(data.invoiceNumber, width - margin, height - 69, 10, bold, navy);
  drawRight(`Invoice date  ${date(data.createdAt)}`, width - margin, height - 86, 9, regular, muted);
  if (data.dueDate) drawRight(`Due date  ${date(data.dueDate)}`, width - margin, height - 101, 9, regular, muted);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: blue });
  y -= 22;

  const columnGap = 28;
  const columnWidth = (width - margin * 2 - columnGap) / 2;
  const rightColumn = margin + columnWidth + columnGap;
  page.drawText("BILL TO", { x: margin, y, size: 8, font: bold, color: blue });
  page.drawText("PROJECT", { x: rightColumn, y, size: 8, font: bold, color: blue });
  const billLines = [data.customerName, ...wrap(data.customerAddress, regular, 9, columnWidth)].filter(Boolean);
  const projectName = data.projectName.trim().toLowerCase() === data.title.trim().toLowerCase() ? "" : data.projectName;
  const projectLines = [projectName, ...wrap(data.projectAddress, regular, 9, columnWidth)].filter(Boolean);
  const detailTop = y - 17;
  billLines.forEach((line, index) => page.drawText(printable(line), { x: margin, y: detailTop - index * 13, size: index === 0 ? 10 : 9, font: index === 0 ? bold : regular, color: navy }));
  projectLines.forEach((line, index) => page.drawText(printable(line), { x: rightColumn, y: detailTop - index * 13, size: index === 0 && projectName ? 10 : 9, font: index === 0 && projectName ? bold : regular, color: navy }));
  y = detailTop - Math.max(billLines.length, projectLines.length, 1) * 13 - 16;

  if (data.title.trim().toLowerCase() !== data.projectName.trim().toLowerCase()) {
    drawWrapped(data.title, margin, width - margin * 2, 13, bold, 17);
    y -= 5;
  }
  const drawTableHeader = () => {
    ensure(28);
    page.drawRectangle({ x: margin, y: y - 18, width: width - margin * 2, height: 24, color: blue });
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
        drawRight(money(item.unitPrice), 486, y, 9);
        drawRight(money(item.totalPrice), width - margin - 8, y, 9);
      }
      y -= rowHeight;
      page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 0.5, color: rule });
      firstChunk = false;
    }
  }

  ensure(110);
  const totalsX = 374;
  const drawTotal = (label: string, value: number, emphasized = false) => {
    if (emphasized) page.drawRectangle({ x: totalsX - 8, y: y - 6, width: width - margin - totalsX + 8, height: 23, color: rgb(0.93, 0.96, 1) });
    page.drawText(label, { x: totalsX, y, size: emphasized ? 10 : 9, font: emphasized ? bold : regular, color: emphasized ? blue : navy });
    drawRight(money(value), width - margin, y, emphasized ? 10 : 9, emphasized ? bold : regular, emphasized ? blue : navy);
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
    page.drawText("PAYMENT HISTORY", { x: margin, y, size: 9, font: bold, color: blue });
    y -= 16;
    for (const payment of data.payments) {
      drawWrapped(`${date(payment.dateReceived)}  ${payment.method.replaceAll("_", " ")}  ${money(payment.amount)}${payment.memo ? `  ${payment.memo}` : ""}`, margin, width - margin * 2, 9);
    }
  }
  if (data.notes) {
    y -= 8;
    ensure(34);
    page.drawText("NOTES", { x: margin, y, size: 9, font: bold, color: blue });
    y -= 16;
    drawWrapped(data.notes, margin, width - margin * 2, 9);
  }

  document.getPages().forEach((pdfPage, index, pages) => {
    pdfPage.drawLine({ start: { x: margin, y: 30 }, end: { x: width - margin, y: 30 }, thickness: 0.5, color: rule });
    pdfPage.drawText("I.S Painting", { x: margin, y: 17, size: 8, font: bold, color: navy });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    pdfPage.drawText(pageLabel, { x: width - margin - regular.widthOfTextAtSize(pageLabel, 8), y: 17, size: 8, font: regular, color: muted });
  });

  return document.save();
}
