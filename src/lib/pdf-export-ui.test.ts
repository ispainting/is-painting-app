import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PDF page wiring", () => {
  it.each(["time", "jobs", "opportunities", "customers", "employees", "inventory", "reports"])(
    "%s uses the shared exporter with loading/error gating", page => {
      const source = readFileSync(`src/app/(admin)/${page}/page.tsx`, "utf8");
      expect(source).toContain('import { ExportPdfButton } from "@/components/ExportPdfButton"');
      expect(source).toContain("<ExportPdfButton");
      expect(source).toMatch(/disabled=\{[^}]*(?:isFetching)[^}]*(?:isError)/);
    }
  );

  it("uses the exact shared filtered Opportunity records for either view", () => {
    const source = readFileSync("src/app/(admin)/opportunities/page.tsx", "utf8");
    expect(source).toContain("const filtered = filteredViews[view]");
    expect(source).toContain("opportunitiesPdf(filtered,");
  });

  it("exports the same payroll calculation and exposes existing errors without a second formula", () => {
    const source = readFileSync("src/app/(admin)/time/page.tsx", "utf8");
    expect(source).toContain("return buildPayrollSummaries(rows, employeeRows)");
    expect(source).toContain("payrollPdf(rows, employeeSummaries,");
    expect(source).not.toContain("const overtimePart");
  });

  it("uses Blob downloads with delayed URL cleanup, busy state and visible errors", () => {
    const source = readFileSync("src/components/ExportPdfButton.tsx", "utf8");
    expect(source).toContain('type: "application/pdf"');
    expect(source).toContain("link.download = pdfFilename");
    expect(source).toContain("document.body.appendChild(link)");
    expect(source).toContain("URL.revokeObjectURL(url), 60_000");
    expect(source).toContain("aria-busy={loading}");
    expect(source).toContain("toast.error");
    expect(source).not.toContain("mutate");
  });
});
