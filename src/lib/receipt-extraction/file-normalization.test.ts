import { describe, expect, it } from "vitest";
import { normalizeReceiptFile } from "./file-normalization";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const asArrayBuffer = (buffer: Buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

describe("receipt file normalization", () => {
  it("normalizes a supported image to bounded JPEG", async () => {
    const result = await normalizeReceiptFile({ data: asArrayBuffer(onePixelPng), mimeType: "image/png", filename: "receipt.png" });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.filename).toBe("receipt.jpg");
    expect(new Uint8Array(result.data).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("preserves a PDF for provider input_file extraction", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%%EOF", "ascii");
    const result = await normalizeReceiptFile({ data: asArrayBuffer(pdf), mimeType: "application/pdf", filename: "receipt.pdf" });
    expect(result.mimeType).toBe("application/pdf");
    expect(Buffer.from(result.data).toString("ascii")).toContain("%PDF-1.4");
  });

  it("rejects unsupported or spoofed file content", async () => {
    const text = Buffer.from("not an image", "utf8");
    await expect(normalizeReceiptFile({ data: asArrayBuffer(text), mimeType: "image/png", filename: "receipt.png" })).rejects.toMatchObject({ kind: "unsupported_file" });
    await expect(normalizeReceiptFile({ data: asArrayBuffer(onePixelPng), mimeType: "application/pdf", filename: "receipt.pdf" })).rejects.toMatchObject({ kind: "unsupported_file" });
  });
});
