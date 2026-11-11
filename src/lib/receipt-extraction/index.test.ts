import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptExtractionError } from "./errors";

const originalProvider = process.env.RECEIPT_EXTRACTION_PROVIDER;

async function loadModuleFresh() {
  vi.resetModules();
  return import("./index");
}

describe("receipt extraction provider selection", () => {
  beforeEach(() => {
    delete process.env.RECEIPT_EXTRACTION_PROVIDER;
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.RECEIPT_EXTRACTION_PROVIDER;
    else process.env.RECEIPT_EXTRACTION_PROVIDER = originalProvider;
  });

  it("defaults to the OpenAI provider when unset", async () => {
    const { getReceiptExtractionProvider } = await loadModuleFresh();
    expect(getReceiptExtractionProvider().constructor.name).toBe("OpenAiReceiptExtractionProvider");
  });

  it("classifies an unsupported configured provider as a typed configuration error, not an opaque Error", async () => {
    process.env.RECEIPT_EXTRACTION_PROVIDER = "manus";
    const { getReceiptExtractionProvider } = await loadModuleFresh();

    let caught: unknown;
    try {
      getReceiptExtractionProvider();
    } catch (error) {
      caught = error;
    }

    // Loaded via a reset module registry, so compare shape rather than a cross-instance `instanceof`.
    const typed = caught as ReceiptExtractionError;
    expect(typed?.name).toBe("ReceiptExtractionError");
    expect(typed.kind).toBe("missing_configuration");
    expect(typed.logMessage).toContain("manus");
    expect(typed.userMessage).not.toContain("manus");
  });

  it("rejects a stale Google Document AI override with a clear configuration error", async () => {
    process.env.RECEIPT_EXTRACTION_PROVIDER = "google_document_ai";
    const { getReceiptExtractionProvider } = await loadModuleFresh();

    let caught: unknown;
    try {
      getReceiptExtractionProvider();
    } catch (error) {
      caught = error;
    }

    const typed = caught as ReceiptExtractionError;
    expect(typed?.name).toBe("ReceiptExtractionError");
    expect(typed.kind).toBe("missing_configuration");
    expect(typed.logMessage).toContain("google_document_ai");
    expect(typed.logMessage).toContain("OpenAI is required");
  });

  it("logs only the selected provider and boolean key diagnostics, never raw values", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { getReceiptExtractionProvider } = await loadModuleFresh();
    getReceiptExtractionProvider();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const event = consoleSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(event.event).toBe("receipt_extraction_provider_selected");
    expect(event.provider).toBe("openai");
    expect(event.openAiKeyConfig).toMatchObject({
      exists: expect.any(Boolean),
      nonEmpty: expect.any(Boolean),
      hasExpectedPrefix: expect.any(Boolean),
    });
    expect(JSON.stringify(event)).not.toContain("sk-");
    consoleSpy.mockRestore();
  });
});
