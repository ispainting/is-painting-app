import { writeFileSync } from "node:fs";
import { normalizeExtractionResponse, shouldMarkNeedsReview } from "../normalization";
import type {
  ReceiptExtractionInput,
  ReceiptExtractionProvider,
  ReceiptExtractionResult,
} from "../types";
import { GoogleAuth } from "google-auth-library";

const DEFAULT_LOCATION = "us";
const DOC_AI_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const EXTERNAL_ACCOUNT_CONFIG_PATH = "/tmp/google-external-account-config.json";

type DocAiEntity = {
  type?: string;
  mentionText?: string;
  confidence?: number;
  normalizedValue?: {
    text?: string;
    moneyValue?: {
      units?: string | number;
      nanos?: number;
    };
    dateValue?: {
      year?: number;
      month?: number;
      day?: number;
    };
    datetimeValue?: {
      year?: number;
      month?: number;
      day?: number;
    };
    integerValue?: string | number;
    floatValue?: string | number;
  };
  properties?: DocAiEntity[];
};

type DocumentAiProcessResponse = {
  document?: {
    text?: string;
    entities?: DocAiEntity[];
  };
};

class DocumentAiReceiptError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DocumentAiReceiptError";
    this.code = code;
  }
}

function toLower(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

function isExtractionEnabled() {
  const raw = (
    process.env.RECEIPT_EXTRACTION_ENABLED
    ?? process.env.MANUS_RECEIPT_EXTRACTION_ENABLED
    ?? "false"
  ).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function toDateString(value: { year?: number; month?: number; day?: number } | undefined) {
  if (!value?.year || !value?.month || !value?.day) return null;
  const yyyy = String(value.year).padStart(4, "0");
  const mm = String(value.month).padStart(2, "0");
  const dd = String(value.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toEntityScalar(entity: DocAiEntity): string | number | null {
  const normalized = entity.normalizedValue;
  if (normalized?.moneyValue) {
    const units = Number(normalized.moneyValue.units || 0);
    const nanos = Number(normalized.moneyValue.nanos || 0);
    return Number((units + nanos / 1_000_000_000).toFixed(2));
  }

  if (normalized?.dateValue) {
    const d = toDateString(normalized.dateValue);
    if (d) return d;
  }

  if (normalized?.datetimeValue) {
    const d = toDateString(normalized.datetimeValue);
    if (d) return d;
  }

  if (normalized?.floatValue != null) {
    const num = Number(normalized.floatValue);
    if (!Number.isNaN(num)) return num;
  }

  if (normalized?.integerValue != null) {
    const num = Number(normalized.integerValue);
    if (!Number.isNaN(num)) return num;
  }

  if (normalized?.text) {
    return normalized.text;
  }

  if (entity.mentionText) {
    return entity.mentionText;
  }

  return null;
}

function toConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function flattenEntities(entities: DocAiEntity[]): DocAiEntity[] {
  const out: DocAiEntity[] = [];
  for (const entity of entities) {
    out.push(entity);
    if (Array.isArray(entity.properties) && entity.properties.length > 0) {
      out.push(...flattenEntities(entity.properties));
    }
  }
  return out;
}

function matchesType(entity: DocAiEntity, aliases: string[]) {
  const kind = toLower(entity.type);
  return aliases.some((alias) => kind === alias || kind.endsWith(`/${alias}`) || kind.includes(alias));
}

function pickBestEntity(entities: DocAiEntity[], aliases: string[]) {
  const candidates = entities.filter((entity) => matchesType(entity, aliases));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => toConfidence(b.confidence) - toConfidence(a.confidence))[0];
}

function getEntityValueWithConfidence(entities: DocAiEntity[], aliases: string[]) {
  const best = pickBestEntity(entities, aliases);
  return {
    value: best ? toEntityScalar(best) : null,
    confidence: best ? toConfidence(best.confidence) : 0,
  };
}

function parseLineItems(entities: DocAiEntity[]) {
  const roots = entities.filter((entity) => matchesType(entity, ["line_item", "line-item", "item"]));
  if (roots.length === 0) return [];

  return roots.slice(0, 100).map((root) => {
    const props = Array.isArray(root.properties) ? root.properties : [];
    const description = getEntityValueWithConfidence(props, ["description", "name", "item", "product", "line_item/description"]);
    const quantity = getEntityValueWithConfidence(props, ["quantity", "qty", "line_item/quantity"]);
    const unitPrice = getEntityValueWithConfidence(props, ["unit_price", "unitprice", "price", "line_item/unit_price"]);
    const total = getEntityValueWithConfidence(props, ["amount", "total", "line_total", "line_item/amount", "line_item/total"]);

    return {
      description: typeof description.value === "string" && description.value.trim() ? description.value.trim() : "Line item",
      quantity: quantity.value,
      unitPrice: unitPrice.value,
      totalPrice: total.value,
      confidence: Math.max(
        toConfidence(root.confidence),
        description.confidence,
        quantity.confidence,
        unitPrice.confidence,
        total.confidence,
      ),
    };
  });
}

function mapDocAiToLooseExtraction(response: DocumentAiProcessResponse) {
  const entities = flattenEntities(response.document?.entities || []);

  const vendor = getEntityValueWithConfidence(entities, ["supplier_name", "merchant_name", "vendor_name", "seller_name", "vendor"]);
  const date = getEntityValueWithConfidence(entities, ["invoice_date", "receipt_date", "transaction_date", "date"]);
  const subtotal = getEntityValueWithConfidence(entities, ["net_amount", "subtotal", "sub_total"]);
  const tax = getEntityValueWithConfidence(entities, ["total_tax_amount", "tax_amount", "tax"]);
  const total = getEntityValueWithConfidence(entities, ["total_amount", "amount_due", "grand_total", "total"]);
  const paymentMethod = getEntityValueWithConfidence(entities, ["payment_method", "payment_type"]);
  const receiptNumber = getEntityValueWithConfidence(entities, ["receipt_id", "transaction_id", "reference_number"]);
  const invoiceNumber = getEntityValueWithConfidence(entities, ["invoice_id", "invoice_number"]);

  const confidenceValues = [
    vendor.confidence,
    date.confidence,
    subtotal.confidence,
    tax.confidence,
    total.confidence,
    paymentMethod.confidence,
    receiptNumber.confidence,
    invoiceNumber.confidence,
  ].filter((value) => value > 0);

  const overallConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length
    : 0;

  return {
    vendor,
    date,
    subtotal,
    tax,
    total,
    paymentMethod,
    receiptNumber,
    invoiceNumber,
    category: { value: null, confidence: 0 },
    description: { value: null, confidence: 0 },
    items: parseLineItems(entities),
    rawText: response.document?.text || null,
    overallConfidence,
  };
}

function ensureExternalAccountAdcFromEnv() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return;

  const rawConfig = process.env.GOOGLE_EXTERNAL_ACCOUNT_CONFIG_JSON?.trim();
  if (!rawConfig) return;

  writeFileSync(EXTERNAL_ACCOUNT_CONFIG_PATH, rawConfig, { encoding: "utf8", mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = EXTERNAL_ACCOUNT_CONFIG_PATH;
}

function getProjectId() {
  const projectId =
    process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID?.trim()
    || process.env.GOOGLE_CLOUD_PROJECT?.trim()
    || process.env.GCLOUD_PROJECT?.trim();

  if (!projectId) {
    throw new DocumentAiReceiptError(
      "AI provider unavailable: missing GOOGLE_DOCUMENT_AI_PROJECT_ID (or GOOGLE_CLOUD_PROJECT).",
      "bad_request",
    );
  }
  return projectId;
}

function getLocation() {
  return process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || DEFAULT_LOCATION;
}

function getProcessorId() {
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim();
  if (!processorId) {
    throw new DocumentAiReceiptError(
      "AI provider unavailable: missing GOOGLE_DOCUMENT_AI_PROCESSOR_ID.",
      "bad_request",
    );
  }
  return processorId;
}

async function getAccessToken() {
  ensureExternalAccountAdcFromEnv();

  try {
    const auth = new GoogleAuth({ scopes: [DOC_AI_SCOPE] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token) {
      throw new DocumentAiReceiptError("AI provider unavailable: failed to obtain Google ADC access token.", "unauthorized");
    }
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google ADC authentication failed.";
    throw new DocumentAiReceiptError(`AI provider unavailable: ${message}`, "unauthorized");
  }
}

function mapGoogleErrorCode(httpStatus: number, payloadCode: string | undefined, message: string | undefined) {
  const raw = toLower(payloadCode);
  const text = toLower(message);

  if (raw === "resource_exhausted" || text.includes("resource_exhausted") || text.includes("credit") || text.includes("quota")) {
    return "resource_exhausted";
  }
  if (raw === "unauthenticated" || raw === "permission_denied" || httpStatus === 401 || httpStatus === 403) {
    return "unauthorized";
  }
  if (raw === "invalid_argument" || httpStatus === 400) {
    return "bad_request";
  }
  if (raw === "deadline_exceeded" || httpStatus === 504) {
    return "timeout";
  }
  if (httpStatus === 429) {
    return "rate_limit";
  }
  if (httpStatus >= 500) {
    return "network_error";
  }
  return "unknown";
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getProcessorResourceName(projectId: string, location: string, processorId: string) {
  const versionId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION_ID?.trim();
  if (!versionId) {
    return `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }
  return `projects/${projectId}/locations/${location}/processors/${processorId}/processorVersions/${versionId}`;
}

export class GoogleDocumentAiReceiptExtractionProvider implements ReceiptExtractionProvider {
  async extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult> {
    if (!isExtractionEnabled()) {
      throw new DocumentAiReceiptError(
        "AI receipt extraction is currently disabled. You can enter this expense manually.",
        "bad_request",
      );
    }

    const projectId = getProjectId();
    const location = getLocation();
    const processorId = getProcessorId();
    const processorResource = getProcessorResourceName(projectId, location, processorId);

    const accessToken = await getAccessToken();
    const startedAt = Date.now();

    const endpoint = `https://${location}-documentai.googleapis.com/v1/${processorResource}:process`;
    const requestBody = {
      rawDocument: {
        mimeType: input.mimeType,
        content: Buffer.from(input.fileData).toString("base64"),
      },
      skipHumanReview: true,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document AI request failed.";
      throw new DocumentAiReceiptError(`AI provider unavailable: ${message}`, "network_error");
    }

    const bodyText = await response.text();
    const parsed = safeJsonParse(bodyText) as {
      error?: { code?: number; status?: string; message?: string };
      document?: DocumentAiProcessResponse["document"];
    } | null;

    if (!response.ok) {
      const errStatus = parsed?.error?.status;
      const errMessage = parsed?.error?.message;
      const mappedCode = mapGoogleErrorCode(response.status, errStatus, errMessage);
      throw new DocumentAiReceiptError(
        `AI provider unavailable: ${response.status} ${errMessage || errStatus || "request failed"}`,
        mappedCode,
      );
    }

    const mappedInput = mapDocAiToLooseExtraction({ document: parsed?.document });
    const normalized = normalizeExtractionResponse(mappedInput, input.jobOptions);

    return {
      normalized,
      provider: "google_document_ai",
      model: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION_ID?.trim() || "document-ai-processor",
      needsReview: shouldMarkNeedsReview(normalized),
      metadata: {
        taskId: null,
        creditsUsed: null,
        durationMs: Date.now() - startedAt,
        success: true,
        status: "processed",
        taskCreated: false,
      },
    };
  }
}