import { createHmac, timingSafeEqual } from "node:crypto";

// Checks for the lead webhooks under /api/webhooks. Those paths are public in src/middleware.ts
// because their callers have no session cookie, so every handler must call one of these first. All
// fail closed when the secret isn't configured, same as src/lib/orion-auth.ts.

export type WebhookAuth = "ok" | "denied" | "unconfigured";

function same(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function check(given: string | null | undefined, secret: string | undefined): WebhookAuth {
  if (!secret) return "unconfigured";
  return same(given ?? "", secret) ? "ok" : "denied";
}

/** Meta signs the exact bytes it sent, so this needs the body before it's parsed. */
export function checkMetaSignature(rawBody: string, header: string | null): WebhookAuth {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return "unconfigured";
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  return same(header ?? "", expected) ? "ok" : "denied";
}

export function checkMetaVerifyToken(token: string | null): WebhookAuth {
  return check(token, process.env.META_WEBHOOK_VERIFY_TOKEN);
}

export function checkGoogleKey(key: unknown): WebhookAuth {
  return check(typeof key === "string" ? key : null, process.env.GOOGLE_LEADS_WEBHOOK_KEY);
}

export function checkWebsiteSecret(req: Request): WebhookAuth {
  return check(req.headers.get("x-webhook-secret"), process.env.WEBSITE_LEADS_SECRET);
}
