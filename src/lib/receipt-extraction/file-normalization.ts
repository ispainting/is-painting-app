import sharp from "sharp";
import { ReceiptExtractionError } from "./errors";

const MAX_IMAGE_DIMENSION = 2200;
const JPEG_QUALITY = 82;

export type NormalizedReceiptFile = {
  data: ArrayBuffer;
  mimeType: "image/jpeg" | "application/pdf";
  filename: string;
  sourceMimeType: string;
  sourceSize: number;
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectReceiptMime(data: ArrayBuffer): string | null {
  const bytes = new Uint8Array(data);
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function normalizeReceiptFile(input: {
  data: ArrayBuffer;
  mimeType: string;
  filename: string;
}): Promise<NormalizedReceiptFile> {
  const sourceMimeType = input.mimeType.toLowerCase();
  const detectedMime = detectReceiptMime(input.data);
  if (!detectedMime) {
    throw new ReceiptExtractionError({ kind: "unsupported_file", userMessage: "This receipt format can't be scanned automatically. The receipt is attached, and you can enter the expense manually.", logMessage: `Unsupported receipt file signature for declared MIME ${sourceMimeType}.` });
  }
  if (sourceMimeType === "application/pdf" && detectedMime !== "application/pdf") {
    throw new ReceiptExtractionError({ kind: "unsupported_file", userMessage: "This receipt format can't be scanned automatically. The receipt is attached, and you can enter the expense manually.", logMessage: `Receipt file signature ${detectedMime} does not match declared MIME ${sourceMimeType}.` });
  }
  if (detectedMime === "application/pdf") {
    return { data: input.data, mimeType: "application/pdf", filename: input.filename.toLowerCase().endsWith(".pdf") ? input.filename : `${input.filename}.pdf`, sourceMimeType, sourceSize: input.data.byteLength };
  }
  if (!sourceMimeType.startsWith("image/")) {
    throw new ReceiptExtractionError({ kind: "unsupported_file", userMessage: "This receipt format can't be scanned automatically. The receipt is attached, and you can enter the expense manually.", logMessage: `Image signature ${detectedMime} does not match declared MIME ${sourceMimeType}.` });
  }

  try {
    const normalized = await sharp(Buffer.from(input.data), { failOn: "error" })
      .rotate()
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "white" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { data: toArrayBuffer(normalized), mimeType: "image/jpeg", filename: input.filename.replace(/\.[^.]+$/, "") + ".jpg", sourceMimeType, sourceSize: input.data.byteLength };
  } catch (error) {
    throw new ReceiptExtractionError({ kind: "unsupported_file", userMessage: "This receipt image can't be normalized for scanning. The receipt is attached, and you can enter the expense manually.", logMessage: "Receipt image normalization failed.", cause: error });
  }
}
