const TEMPORARY_UNAVAILABLE_MESSAGE = "Receipt scanning is temporarily unavailable. The receipt is attached; retry reading or enter the expense manually.";
const UNSUPPORTED_FILE_MESSAGE = "This receipt format can't be scanned automatically. The receipt is attached, and you can enter the expense manually.";
const STORAGE_UNAVAILABLE_MESSAGE = "The receipt was attached, but it could not be opened for scanning. Retry reading or enter the expense manually.";
const CONFIGURATION_MESSAGE = "Receipt scanning is not configured right now. The receipt is attached, and you can enter the expense manually.";
const MALFORMED_RESPONSE_MESSAGE = "The receipt was attached, but the scanner could not understand the result. Retry reading or enter the expense manually.";

export type ReceiptExtractionFailureKind =
  | "billing_unavailable"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "storage_unavailable"
  | "missing_configuration"
  | "payload_too_large"
  | "malformed_response"
  | "unsupported_file"
  | "unknown";

type ReceiptExtractionErrorOptions = {
  kind: ReceiptExtractionFailureKind;
  userMessage: string;
  logMessage: string;
  cause?: unknown;
  providerStatus?: number;
  retryable?: boolean;
};

export class ReceiptExtractionError extends Error {
  readonly kind: ReceiptExtractionFailureKind;
  readonly userMessage: string;
  readonly logMessage: string;
  readonly providerStatus?: number;
  readonly retryable: boolean;
  override readonly cause: unknown;

  constructor(options: ReceiptExtractionErrorOptions) {
    super(options.userMessage);
    this.name = "ReceiptExtractionError";
    this.kind = options.kind;
    this.userMessage = options.userMessage;
    this.logMessage = options.logMessage;
    this.providerStatus = options.providerStatus;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

export function createOpenAiHttpError(status: number, details: string) {
  const normalized = `${status} ${details}`.toLowerCase();
  if (status === 413) {
    return new ReceiptExtractionError({ kind: "payload_too_large", userMessage: UNSUPPORTED_FILE_MESSAGE, logMessage: `OpenAI payload too large (${status}).`, providerStatus: status });
  }
  if (status === 429 && normalized.includes("credit_balance_exhausted")) {
    return new ReceiptExtractionError({ kind: "billing_unavailable", userMessage: TEMPORARY_UNAVAILABLE_MESSAGE, logMessage: `OpenAI billing exhausted (${status}): ${details}`, providerStatus: status });
  }
  if (status === 429 || normalized.includes("rate_limit_exceeded")) {
    return new ReceiptExtractionError({ kind: "rate_limited", userMessage: TEMPORARY_UNAVAILABLE_MESSAGE, logMessage: `OpenAI rate limited (${status}): ${details}`, providerStatus: status, retryable: true });
  }
  return new ReceiptExtractionError({ kind: "provider_unavailable", userMessage: TEMPORARY_UNAVAILABLE_MESSAGE, logMessage: `OpenAI provider unavailable (${status}): ${details}`, providerStatus: status, retryable: status === 408 || status === 409 || status === 429 || status >= 500 });
}

export function normalizeReceiptExtractionError(error: unknown): ReceiptExtractionError {
  if (error instanceof ReceiptExtractionError) return error;
  const message = error instanceof Error ? error.message : "Unknown receipt extraction failure.";
  const normalized = message.toLowerCase();

  if (normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("aborterror")) {
    return new ReceiptExtractionError({ kind: "timeout", userMessage: TEMPORARY_UNAVAILABLE_MESSAGE, logMessage: message, cause: error, retryable: true });
  }
  if (normalized.includes("invalid json") || normalized.includes("valid json output") || normalized.includes("malformed")) {
    return new ReceiptExtractionError({ kind: "malformed_response", userMessage: MALFORMED_RESPONSE_MESSAGE, logMessage: message, cause: error });
  }
  if (normalized.includes("unsupported file") || normalized.includes("file signature") || normalized.includes("image normalization")) {
    return new ReceiptExtractionError({ kind: "unsupported_file", userMessage: UNSUPPORTED_FILE_MESSAGE, logMessage: message, cause: error });
  }
  if (normalized.includes("blob") || normalized.includes("receipt storage") || normalized.includes("storage object")) {
    return new ReceiptExtractionError({ kind: "storage_unavailable", userMessage: STORAGE_UNAVAILABLE_MESSAGE, logMessage: message, cause: error, retryable: true });
  }
  if (normalized.includes("openai_api_key") || normalized.includes("credentials are not available")) {
    return new ReceiptExtractionError({ kind: "missing_configuration", userMessage: CONFIGURATION_MESSAGE, logMessage: message, cause: error });
  }
  if (normalized.includes("payload") && normalized.includes("large")) {
    return new ReceiptExtractionError({ kind: "payload_too_large", userMessage: UNSUPPORTED_FILE_MESSAGE, logMessage: message, cause: error });
  }
  if (normalized.includes("provider unavailable") || normalized.includes("service unavailable") || normalized.includes("no credits remaining") || normalized.includes("credit_balance_exhausted") || normalized.includes("fetch failed") || normalized.includes("econnreset") || normalized.includes("network")) {
    return new ReceiptExtractionError({ kind: "provider_unavailable", userMessage: TEMPORARY_UNAVAILABLE_MESSAGE, logMessage: message, cause: error, retryable: true });
  }
  return new ReceiptExtractionError({ kind: "unknown", userMessage: TEMPORARY_UNAVAILABLE_MESSAGE, logMessage: message, cause: error });
}

export function serializeReceiptExtractionError(error: ReceiptExtractionError) {
  return {
    name: error.name,
    kind: error.kind,
    userMessage: error.userMessage,
    logMessage: error.logMessage,
    providerStatus: error.providerStatus,
    retryable: error.retryable,
    cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message } : undefined,
  };
}
