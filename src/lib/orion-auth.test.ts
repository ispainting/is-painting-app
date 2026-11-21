import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLeadIntakeAuth, checkOrionAuth, checkReadAuth, classifyWordPressLead } from "./orion-auth";

describe("server-to-server lead credentials", () => {
  const wordpress = randomUUID();
  const orion = randomUUID();
  const make = randomUUID();
  const viktor = randomUUID();
  const request = (key: string) => new Request("https://example.invalid/api/orion/leads", {
    headers: { authorization: `Bearer ${key}` },
  });

  beforeEach(() => {
    vi.stubEnv("WORDPRESS_LEADS_SECRET", wordpress);
    vi.stubEnv("ORION_API_SECRET", orion);
    vi.stubEnv("MAKE_API_SECRET", make);
    vi.stubEnv("VIKTOR_API_SECRET", viktor);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("admits WordPress only to lead intake", () => {
    expect(checkLeadIntakeAuth(request(wordpress))).toEqual({ result: "ok", caller: "WordPress" });
    expect(checkReadAuth(request(wordpress))).toBe("denied");
    expect(checkOrionAuth(request(wordpress))).toBe("denied");
  });

  it("preserves existing caller roles when the WordPress key is absent", () => {
    vi.stubEnv("WORDPRESS_LEADS_SECRET", undefined);
    expect(checkLeadIntakeAuth(request(make))).toEqual({ result: "ok", caller: "Make" });
    expect(checkLeadIntakeAuth(request(orion))).toEqual({ result: "ok", caller: "ORION" });
    expect(checkLeadIntakeAuth(request(viktor)).result).toBe("denied");
    expect(checkReadAuth(request(viktor))).toBe("ok");
    expect(checkLeadIntakeAuth(request(wordpress)).result).toBe("denied");
  });

  it("supports a separately configured WordPress key and fails closed without intake keys", () => {
    vi.stubEnv("ORION_API_SECRET", undefined);
    vi.stubEnv("MAKE_API_SECRET", undefined);
    expect(checkLeadIntakeAuth(request(wordpress)).caller).toBe("WordPress");
    expect(checkLeadIntakeAuth(request(make)).result).toBe("denied");
    vi.stubEnv("WORDPRESS_LEADS_SECRET", undefined);
    expect(checkLeadIntakeAuth(request(wordpress)).result).toBe("unconfigured");
  });
});

describe("WordPress quote scope", () => {
  const id = randomUUID();
  const quote = { leadId: `coastal:${id}`, source: "Website", name: "Sample homeowner", phone: "(508) 555-0101" };

  it("accepts the plugin's quote with a required phone and optional email", () => {
    expect(classifyWordPressLead(quote)).toBe("quote");
    expect(classifyWordPressLead({ ...quote, phone: undefined })).toBe("denied");
  });

  it("recognizes only the plugin's explicit connection check", () => {
    const check = { source: "Website", name: "Test lead", leadId: `check:${id}` };
    expect(classifyWordPressLead(check)).toBe("check");
    expect(classifyWordPressLead({ ...check, name: quote.name })).toBe("denied");
    expect(classifyWordPressLead({ ...quote, name: check.name })).toBe("quote");
  });

  it("rejects other senders' IDs and sources before a quote can enter the pipeline", () => {
    for (const source of ["Meta", "Google", "Concierge"]) {
      expect(classifyWordPressLead({ ...quote, source })).toBe("denied");
    }
    for (const leadId of ["meta:123", "google:123", "coastal:123", `other:${id}`]) {
      expect(classifyWordPressLead({ ...quote, leadId })).toBe("denied");
    }
  });
});
