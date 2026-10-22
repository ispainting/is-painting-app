import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { buildExportPdf, pdfDate, pdfFilename, type PdfExportDocument } from "./pdf-export";

const generatedAt = new Date("2026-10-22T01:01:00Z");
const document = (rows: string[][] = []): PdfExportDocument => ({
  title: "Test export", generatedAt, dateRange: "2026-09-01 through 2026-09-30",
  filters: [["Status", "Active"], ["Search", "Customer"]], recordCount: rows.length,
  summary: [["Total", "$10.00"]],
  tables: [{ title: "Records", columns: ["Repeated header", "Amount"], rows }],
});

async function pdfText(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const streams = pdf.context.enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map(stream => new TextDecoder().decode(decodePDFRawStream(stream).decode()));
  const text = streams.map(stream => Array.from(stream.matchAll(/<([0-9A-F]+)>\s*Tj/g))
    .map(match => Buffer.from(match[1], "hex").toString("latin1")).join("\n")).join("\n");
  return { pdf, text, streams };
}

describe("shared PDF export renderer", () => {
  it("creates a valid empty PDF with branding, filters, date range, count and confidentiality", async () => {
    const bytes = await buildExportPdf(document());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { pdf, text } = await pdfText(bytes);
    expect(pdf.getPageCount()).toBe(1);
    for (const value of ["I.S Painting Corp", "Test export", "America/New_York", "Selected date range", "Status: Active",
      "Record count: 0", "No records found.", "Internal Use Only", "Page 1 of 1", "Oct 21, 2026"]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("Oct 22, 2026");
  });

  it("paginates long tables, repeats headers and adds page numbers on every page", async () => {
    const rows = Array.from({ length: 250 }, (_, index) => [`Customer ${index} ${"Long address ".repeat(6)}`, "$25.00"]);
    const { pdf, text, streams } = await pdfText(await buildExportPdf(document(rows)));
    expect(pdf.getPageCount()).toBeGreaterThan(5);
    expect(text.match(/Repeated header/g)).toHaveLength(pdf.getPageCount());
    expect(text.match(/I\.S Painting Corp/g)).toHaveLength(pdf.getPageCount());
    expect(text.match(/Internal Use Only/g)).toHaveLength(pdf.getPageCount());
    expect(text).toContain("Customer 249");
    expect(streams.length).toBeGreaterThanOrEqual(pdf.getPageCount());
    expect(text).toContain(`Page ${pdf.getPageCount()} of ${pdf.getPageCount()}`);
  });

  it("splits a single oversized row without dropping its tail", async () => {
    const { pdf, text } = await pdfText(await buildExportPdf(document([[`${"VeryLongName".repeat(3000)} END_OF_ROW`, "$1.00"]])));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(text).toContain("END_OF_ROW");
  });

  it("supports accented names, smart punctuation and addresses", async () => {
    await expect(buildExportPdf(document([["José — O’Connor, 1 Long Street", "$1.00"]]))).resolves.toBeInstanceOf(Uint8Array);
  });

  it("fails explicitly on unsupported characters instead of silently losing names", async () => {
    await expect(buildExportPdf(document([["Employee 😀", "$1.00"]]))).rejects.toThrow("unsupported");
  });

  it("rejects malformed tables", async () => {
    await expect(buildExportPdf(document([["Missing cell"]]))).rejects.toThrow("match its columns");
  });

  it("formats Massachusetts business dates without shifting the day", () => {
    expect(pdfDate(new Date("2026-09-18T04:00:00Z"))).toBe("Sep 18, 2026");
    expect(pdfDate(new Date("2026-12-18T05:00:00Z"))).toBe("Dec 18, 2026");
  });

  it("uses deterministic safe filenames and the Massachusetts generation day", () => {
    expect(pdfFilename("../../Payroll : Sept / 2026?!", generatedAt)).toBe("is-painting-payroll-sept-2026-2026-10-21.pdf");
    expect(pdfFilename("", generatedAt)).toBe("is-painting-report-2026-10-21.pdf");
    expect(pdfFilename("Customers", generatedAt)).toBe(pdfFilename("Customers", generatedAt));
    expect(pdfFilename("x".repeat(300), generatedAt).length).toBeLessThan(130);
  });
});
