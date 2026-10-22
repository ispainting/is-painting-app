"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pdfFilename, type PdfExportDocument } from "@/lib/pdf-export";

export function ExportPdfButton({ build, disabled = false }: {
  build: () => PdfExportDocument | Promise<PdfExportDocument>;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  return <button type="button" className="btn btn-secondary" disabled={disabled || loading} aria-busy={loading} onClick={async () => {
    setLoading(true);
    try {
      const data = await build();
      const { buildExportPdf } = await import("@/lib/pdf-export");
      const bytes = await buildExportPdf(data);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFilename(data.title, data.generatedAt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the URL alive while mobile browsers hand the download to their viewer.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }}>
    {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
    {loading ? "Exporting PDF..." : "Export PDF"}
  </button>;
}
