import { normalizeExtractionResponse, shouldMarkNeedsReview } from "../normalization";
import type {
  ReceiptExtractionInput,
  ReceiptExtractionProvider,
  ReceiptExtractionResult,
} from "../types";

const API_BASE_URL = (process.env.MANUS_API_BASE_URL?.trim() || "https://api.manus.ai").replace(/\/$/, "");
const TASK_CREATE_URL = `${API_BASE_URL}/v2/task.create`;
const TASK_LIST_MESSAGES_URL = `${API_BASE_URL}/v2/task.listMessages`;
const TASK_DETAIL_URL = `${API_BASE_URL}/v2/task.detail`;
const FILE_UPLOAD_URL = `${API_BASE_URL}/v2/file.upload`;
const FILE_DETAIL_URL = `${API_BASE_URL}/v2/file.detail`;
const TIMEOUT_MS = Number(process.env.MANUS_RECEIPT_TIMEOUT_MS || "90000");
const POLL_INTERVAL_MS = Number(process.env.MANUS_RECEIPT_POLL_INTERVAL_MS || "1500");
const DEFAULT_AGENT_PROFILE = "manus-1.6";

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

type ManusErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

class ManusReceiptError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ManusReceiptError";
    this.code = code;
  }
}

function ensureSupportedMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(normalized)) {
    throw new ManusReceiptError(`Unsupported file type for AI reading: ${mimeType}`, "unsupported_type");
  }
}

function getApiKey() {
  const key = process.env.MANUS_API_KEY?.trim();
  const keyState = key ? "FOUND" : "MISSING";
  console.info("[receipt-extraction] MANUS_API_KEY", keyState, {
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
  if (!key) {
    const vercelEnv = process.env.VERCEL_ENV?.trim() || "unknown";
    const nodeEnv = process.env.NODE_ENV?.trim() || "unknown";
    throw new ManusReceiptError(
      `AI provider unavailable: MANUS_API_KEY is missing. MANUS_API_KEY = ${keyState}. VERCEL_ENV = ${vercelEnv}. NODE_ENV = ${nodeEnv}.`,
      "missing_api_key",
    );
  }
  return key;
}

function buildPrompt(jobOptions: Array<{ id: number; name: string }>) {
  const jobNameList = jobOptions.slice(0, 200).map((job) => job.name).join(" | ");
  return [
    "Extract data from this receipt document.",
    "Never invent values. If a value is not visible, return null.",
    "Use YYYY-MM-DD for dates.",
    "Confidence values must be between 0 and 1.",
    "Suggested category should be one of: paint, materials, labor, tools, equipment, rentals, fuel, subcontractor, travel, ferry, payroll_related, office, advertising, insurance, vehicle, meals, other.",
    "Suggest a job only when strong evidence exists in receipt text.",
    `Known jobs: ${jobNameList || "none"}`,
  ].join("\n");
}

const STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    vendor: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    date: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    subtotal: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    tax: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    total: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    paymentMethod: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    receiptNumber: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    invoiceNumber: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    category: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    description: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["value", "confidence"],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          unitPrice: { type: ["number", "null"] },
          totalPrice: { type: ["number", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["description", "quantity", "unitPrice", "totalPrice", "confidence"],
      },
    },
    rawText: { type: ["string", "null"] },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    suggestedJob: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobName: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: ["string", "null"] },
      },
      required: ["jobName", "confidence", "reason"],
    },
  },
  required: [
    "vendor",
    "date",
    "subtotal",
    "tax",
    "total",
    "paymentMethod",
    "receiptNumber",
    "invoiceNumber",
    "category",
    "description",
    "items",
    "rawText",
    "overallConfidence",
    "suggestedJob",
  ],
};

function getErrorMessage(payload: ManusErrorPayload | null, status: number) {
  const code = payload?.error?.code?.trim();
  const message = payload?.error?.message?.trim();
  if (message) return `AI provider unavailable: ${status} ${message.slice(0, 300)}`;
  if (code) return `AI provider unavailable: ${status} ${code}`;
  return `AI provider unavailable: ${status}`;
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        ...(init.headers || {}),
      };
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ManusErrorPayload | null;
        const message = getErrorMessage(payload, response.status);

        if (attempt < maxAttempts && (response.status === 429 || response.status >= 500)) {
          await wait(Math.min(500 * attempt, 1000));
          continue;
        }

        throw new ManusReceiptError(message, payload?.error?.code || "http_error");
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ManusReceiptError("AI timeout: receipt reading exceeded the allowed time.", "timeout");
      }

      if (attempt < maxAttempts) {
        await wait(Math.min(500 * attempt, 1000));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof ManusReceiptError) {
    throw lastError;
  }

  if (lastError instanceof Error) {
    throw new ManusReceiptError(lastError.message, "network_error");
  }

  throw new ManusReceiptError("AI provider request failed.", "request_failed");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FileUploadResponse = {
  file?: {
    id?: string;
  };
  upload_url?: string;
};

type FileDetailResponse = {
  file?: {
    status?: string;
  };
};

type TaskCreateResponse = {
  task_id?: string;
};

type TaskDetailResponse = {
  task?: {
    status?: string;
    credit_usage?: number;
  };
};

type TaskListMessagesResponse = {
  messages?: Array<{
    type?: string;
    error_message?: {
      content?: string;
    };
    structured_output_result?: {
      success?: boolean;
      value?: unknown;
      error?: string | null;
    };
  }>;
};

async function uploadFileToManus(
  apiKey: string,
  input: ReceiptExtractionInput,
): Promise<string> {
  const created = await fetchJsonWithRetry<FileUploadResponse>(
    FILE_UPLOAD_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": apiKey,
      },
      body: JSON.stringify({
        filename: input.originalFilename,
      }),
    },
    TIMEOUT_MS,
  );

  const fileId = created.file?.id;
  const uploadUrl = created.upload_url;
  if (!fileId || !uploadUrl) {
    throw new ManusReceiptError("AI provider unavailable: Manus did not return an upload target.", "upload_target_missing");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": input.mimeType,
    },
    body: Buffer.from(input.fileData),
  });

  if (!uploadResponse.ok) {
    throw new ManusReceiptError(
      `AI provider unavailable: file upload failed (${uploadResponse.status}).`,
      "upload_failed",
    );
  }

  const checkStarted = Date.now();
  while (Date.now() - checkStarted < Math.max(30_000, TIMEOUT_MS / 2)) {
    const detail = await fetchJsonWithRetry<FileDetailResponse>(
      `${FILE_DETAIL_URL}?file_id=${encodeURIComponent(fileId)}`,
      {
        method: "GET",
        headers: {
          "x-manus-api-key": apiKey,
        },
      },
      TIMEOUT_MS,
    );

    const status = detail.file?.status;
    if (status === "uploaded") return fileId;
    if (status === "error" || status === "deleted") {
      throw new ManusReceiptError("AI provider unavailable: uploaded file is not usable.", "file_unusable");
    }

    await wait(Math.max(300, Math.min(POLL_INTERVAL_MS, 1500)));
  }

  throw new ManusReceiptError("AI timeout: file upload processing exceeded the allowed time.", "file_timeout");
}

async function createTask(
  apiKey: string,
  input: ReceiptExtractionInput,
  fileId: string,
): Promise<string> {
  const payload = await fetchJsonWithRetry<TaskCreateResponse>(
    TASK_CREATE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": apiKey,
      },
      body: JSON.stringify({
        agent_profile: DEFAULT_AGENT_PROFILE,
        message: {
          content: [
            { type: "text", text: buildPrompt(input.jobOptions) },
            { type: "file", file_id: fileId },
          ],
        },
        structured_output_schema: STRUCTURED_OUTPUT_SCHEMA,
      }),
    },
    TIMEOUT_MS,
  );

  const taskId = payload.task_id?.trim();
  if (!taskId) {
    throw new ManusReceiptError("AI provider unavailable: Manus did not return a task id.", "task_missing");
  }

  return taskId;
}

async function pollForStructuredResult(apiKey: string, taskId: string) {
  const started = Date.now();
  let lastStatus: string | null = null;
  let lastCreditsUsed: number | null = null;

  while (Date.now() - started < TIMEOUT_MS) {
    const [messagesPayload, detailPayload] = await Promise.all([
      fetchJsonWithRetry<TaskListMessagesResponse>(
        `${TASK_LIST_MESSAGES_URL}?task_id=${encodeURIComponent(taskId)}&limit=100&order=desc`,
        {
          method: "GET",
          headers: {
            "x-manus-api-key": apiKey,
          },
        },
        TIMEOUT_MS,
      ),
      fetchJsonWithRetry<TaskDetailResponse>(
        `${TASK_DETAIL_URL}?task_id=${encodeURIComponent(taskId)}`,
        {
          method: "GET",
          headers: {
            "x-manus-api-key": apiKey,
          },
        },
        TIMEOUT_MS,
      ),
    ]);

    lastStatus = detailPayload.task?.status || null;
    lastCreditsUsed = Number.isFinite(detailPayload.task?.credit_usage)
      ? Number(detailPayload.task?.credit_usage)
      : null;

    const messages = messagesPayload.messages || [];

    const structured = messages.find((message) => message.type === "structured_output_result")
      ?.structured_output_result;

    if (structured) {
      if (structured.success === false) {
        throw new ManusReceiptError(
          structured.error?.trim() || "AI extraction failed to produce a structured result.",
          "structured_output_failed",
        );
      }

      return {
        value: structured.value,
        status: lastStatus,
        creditsUsed: lastCreditsUsed,
        durationMs: Date.now() - started,
      };
    }

    const errorMessage = messages.find((message) => message.type === "error_message")
      ?.error_message
      ?.content
      ?.trim();
    if (errorMessage) {
      throw new ManusReceiptError(errorMessage, "task_error_message");
    }

    if (lastStatus === "error") {
      throw new ManusReceiptError("AI extraction task failed. Please retry.", "task_failed");
    }

    if (lastStatus === "stopped") {
      throw new ManusReceiptError(
        "AI extraction finished without structured data. Please retry.",
        "structured_output_missing",
      );
    }

    await wait(Math.max(300, POLL_INTERVAL_MS));
  }

  throw new ManusReceiptError("AI timeout: receipt reading exceeded the allowed time.", "timeout");
}

export class ManusReceiptExtractionProvider implements ReceiptExtractionProvider {
  async extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult> {
    ensureSupportedMime(input.mimeType);
    const apiKey = getApiKey();

    const extractionStartedAt = Date.now();
    const fileId = await uploadFileToManus(apiKey, input);
    const taskId = await createTask(apiKey, input, fileId);

    const structured = await pollForStructuredResult(apiKey, taskId);
    const normalized = normalizeExtractionResponse(structured.value, input.jobOptions);

    return {
      normalized,
      provider: "manus",
      model: DEFAULT_AGENT_PROFILE,
      needsReview: shouldMarkNeedsReview(normalized),
      metadata: {
        taskId,
        creditsUsed: structured.creditsUsed,
        durationMs: Date.now() - extractionStartedAt,
        success: true,
        status: structured.status,
      },
    };
  }
}
