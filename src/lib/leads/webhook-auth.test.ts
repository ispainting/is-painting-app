import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkGoogleKey, checkMetaSignature, checkMetaVerifyToken, checkWebsiteSecret } from "./webhook-auth";

afterEach(() => vi.unstubAllEnvs());

describe("checkMetaSignature", () => {
  const body = '{"entry":[]}';
  const sign = (secret: string, text: string) => `sha256=${createHmac("sha256", secret).update(text, "utf8").digest("hex")}`;

  it("accepts Meta's signature of the exact body", () => {
    vi.stubEnv("META_APP_SECRET", "app-secret");
    expect(checkMetaSignature(body, sign("app-secret", body))).toBe("ok");
  });

  it("refuses a wrong secret, a changed body or no signature", () => {
    vi.stubEnv("META_APP_SECRET", "app-secret");
    expect(checkMetaSignature(body, sign("other", body))).toBe("denied");
    expect(checkMetaSignature(`${body} `, sign("app-secret", body))).toBe("denied");
    expect(checkMetaSignature(body, null)).toBe("denied");
  });

  it("refuses everything when it isn't configured", () => {
    vi.stubEnv("META_APP_SECRET", "");
    expect(checkMetaSignature(body, sign("", body))).toBe("unconfigured");
  });
});

describe("shared secrets", () => {
  it("checks Meta's verify token", () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify");
    expect(checkMetaVerifyToken("verify")).toBe("ok");
    expect(checkMetaVerifyToken("wrong")).toBe("denied");
    expect(checkMetaVerifyToken(null)).toBe("denied");
  });

  it("checks Google's key and won't compare anything but text", () => {
    vi.stubEnv("GOOGLE_LEADS_WEBHOOK_KEY", "key");
    expect(checkGoogleKey("key")).toBe("ok");
    expect(checkGoogleKey("nope")).toBe("denied");
    expect(checkGoogleKey(["key"])).toBe("denied");
  });

  it("checks the website's header", () => {
    vi.stubEnv("WEBSITE_LEADS_SECRET", "site");
    const req = (value?: string) => new Request("http://localhost/x", { headers: value ? { "x-webhook-secret": value } : {} });
    expect(checkWebsiteSecret(req("site"))).toBe("ok");
    expect(checkWebsiteSecret(req("nope"))).toBe("denied");
    expect(checkWebsiteSecret(req())).toBe("denied");
  });

  it("fails closed when a secret isn't set", () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "");
    vi.stubEnv("GOOGLE_LEADS_WEBHOOK_KEY", "");
    vi.stubEnv("WEBSITE_LEADS_SECRET", "");
    expect(checkMetaVerifyToken("")).toBe("unconfigured");
    expect(checkGoogleKey("")).toBe("unconfigured");
    expect(checkWebsiteSecret(new Request("http://localhost/x"))).toBe("unconfigured");
  });
});
