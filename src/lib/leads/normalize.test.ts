import { describe, expect, it } from "vitest";
import { attributionOf, isOutOfMap, isTestLead, leadFromGoogle, leadFromMeta, leadFromOrion, leadFromWebsite, leadgenIdsFromWebhook, normalizePhone, normalizeService } from "./normalize";

describe("normalizePhone", () => {
  it("reads the ways a US number gets typed", () => {
    for (const typed of ["(508) 555-0199", "508.555.0199", "5085550199", "1 508 555 0199", "+1 (508) 555-0199", "p:+15085550199"]) {
      expect(normalizePhone(typed)).toBe("+15085550199");
    }
  });

  it("keeps a number from another country", () => {
    expect(normalizePhone("+55 11 91234-5678")).toBe("+5511912345678");
  });

  it("gives up rather than guess", () => {
    for (const typed of ["555-0199", "000-555-0199", "508-155-0199", "not a phone", "", null, undefined]) {
      expect(normalizePhone(typed)).toBeNull();
    }
  });
});

describe("normalizeService", () => {
  it("names the four services however the form words them", () => {
    expect(normalizeService("cabinet_painting_/_refinishing")).toBe("Cabinets");
    expect(normalizeService("Interior Painting")).toBe("Interior");
    expect(normalizeService("exterior")).toBe("Exterior");
    expect(normalizeService("Light Commercial")).toBe("Commercial");
  });

  it("keeps any other answer as given, never a guess", () => {
    expect(normalizeService("Deck Staining")).toBe("Deck Staining");
    expect(normalizeService("deck_staining")).toBe("Deck staining");
    expect(normalizeService("interior_and_exterior")).toBe("Interior and exterior");
    expect(normalizeService("  ")).toBeNull();
  });
});

describe("isOutOfMap", () => {
  it("flags Boston metro and nothing else", () => {
    expect(isOutOfMap("Boston")).toBe(true);
    expect(isOutOfMap("West Newton, MA")).toBe(true);
    expect(isOutOfMap("Hyannis")).toBe(false);
    expect(isOutOfMap(undefined)).toBe(false);
  });
});

describe("isTestLead", () => {
  it("recognizes Meta's testing tool", () => {
    expect(isTestLead({ name: "<test lead: dummy data for full_name>" })).toBe(true);
    expect(isTestLead({ details: { service_type: "<test lead: dummy data for service_type>" } })).toBe(true);
    expect(isTestLead({ name: "Maria Testa" })).toBe(false);
  });
});

describe("leadgenIdsFromWebhook", () => {
  const delivery = (field: string, value: object, id = "205413115997902") => ({ object: "page", entry: [{ id, changes: [{ field, value }] }] });

  it("finds new leads on the company's Page", () => {
    expect(leadgenIdsFromWebhook(delivery("leadgen", { leadgen_id: "111", page_id: "205413115997902" }))).toEqual(["111"]);
    expect(leadgenIdsFromWebhook(delivery("leadgen", { leadgen_id: 222 }))).toEqual(["222"]);
  });

  it("ignores other Pages, other events and junk", () => {
    expect(leadgenIdsFromWebhook(delivery("leadgen", { leadgen_id: "111", page_id: "999" }, "999"))).toEqual([]);
    expect(leadgenIdsFromWebhook(delivery("feed", { leadgen_id: "111" }))).toEqual([]);
    expect(leadgenIdsFromWebhook(null)).toEqual([]);
    expect(leadgenIdsFromWebhook({ entry: "nope" })).toEqual([]);
    expect(leadgenIdsFromWebhook({ entry: [{ changes: "nope" }] })).toEqual([]);
  });
});

describe("leadFromMeta", () => {
  const raw = {
    id: "111",
    created_time: "2026-10-16T15:44:26+0000",
    field_data: [
      { name: "full_name", values: ["Maria Exemplo"] },
      { name: "phone_number", values: ["+15085550199"] },
      { name: "email", values: ["maria@example.com"] },
      { name: "what_type_of_service_do_you_need?", values: ["interior_painting"] },
      { name: "town", values: ["Hyannis"] },
      { name: "project_zip_code", values: ["02601"] },
      { name: "when_are_you_hoping_to_start?", values: ["next_month"] },
    ],
    ad_id: "a1",
    ad_name: "Interior Cape",
    adset_id: "s1",
    campaign_id: "c1",
    campaign_name: "Cape Cod",
    form_id: "f1",
  };

  it("maps the form and the ad", () => {
    const lead = leadFromMeta(raw);
    expect(lead).toMatchObject({
      source: "META",
      externalId: "111",
      pipelineKey: "meta:111",
      pipelineSource: "Meta",
      name: "Maria Exemplo",
      phone: "+15085550199",
      email: "maria@example.com",
      service: "interior_painting",
      city: "Hyannis",
      zipCode: "02601",
      details: { "when_are_you_hoping_to_start?": "next_month" },
      origin: { adId: "a1", adName: "Interior Cape", adsetId: "s1", campaignId: "c1", campaignName: "Cape Cod", formId: "f1" },
      dated: true,
    });
    expect(lead.receivedAt.toISOString()).toBe("2026-10-16T15:44:26.000Z");
  });

  it("joins first and last name, and takes the service_type key", () => {
    const lead = leadFromMeta({
      id: "1",
      field_data: [
        { name: "first_name", values: ["Maria"] },
        { name: "last_name", values: ["Exemplo"] },
        { name: "service_type", values: ["cabinets"] },
      ],
    });
    expect(lead.name).toBe("Maria Exemplo");
    expect(lead.service).toBe("cabinets");
    expect(lead.dated).toBe(false);
  });

  it("keeps an answer that doesn't fit on the card instead of losing the lead", () => {
    const long = "x".repeat(40);
    const lead = leadFromMeta({ id: "1", field_data: [{ name: "phone_number", values: [long] }, { name: "email", values: ["not an email"] }] });
    expect(lead.phone).toBeUndefined();
    expect(lead.email).toBeUndefined();
    expect(lead.details).toEqual({ Phone: long, Email: "not an email" });
  });

  it("flags a town outside the service map on the card", () => {
    const lead = leadFromMeta({ id: "1", field_data: [{ name: "city", values: ["Boston"] }] });
    expect(lead.details?.["Service area"]).toMatch(/Outside/);
  });
});

describe("leadFromGoogle", () => {
  const raw = {
    lead_id: "g-1",
    form_id: 42,
    campaign_id: 7,
    adgroup_id: 8,
    creative_id: 9,
    gcl_id: "gclid-1",
    google_key: "the-webhook-password",
    user_column_data: [
      { column_id: "FULL_NAME", column_name: "Full Name", string_value: "João Exemplo" },
      { column_id: "PHONE_NUMBER", column_name: "User Phone", string_value: "+15085550123" },
      { column_id: "EMAIL", column_name: "User Email", string_value: "joao@example.com" },
      { column_id: "SERVICE", column_name: "Which service?", string_value: "Exterior" },
      { column_id: "START", column_name: "When?", string_value: "Soon" },
    ],
  };

  it("maps the columns and the campaign", () => {
    expect(leadFromGoogle(raw)).toMatchObject({
      source: "GOOGLE_ADS",
      externalId: "g-1",
      pipelineKey: "google-form:g-1",
      name: "João Exemplo",
      phone: "+15085550123",
      email: "joao@example.com",
      service: "Exterior",
      details: { "When?": "Soon" },
      origin: { campaignId: "7", adsetId: "8", adId: "9", formId: "42", gclid: "gclid-1" },
    });
  });

  it("never stores the webhook's key", () => {
    expect(JSON.stringify(leadFromGoogle(raw)?.rawPayload)).not.toContain("the-webhook-password");
  });

  it("needs a lead id", () => {
    expect(leadFromGoogle({ user_column_data: [] })).toBeNull();
  });

  it("isn't confused by a column called constructor", () => {
    expect(leadFromGoogle({ lead_id: "1", user_column_data: [{ column_id: "constructor", column_name: "Builder", string_value: "Yes" }] })?.details).toEqual({ Builder: "Yes" });
  });
});

describe("leadFromWebsite", () => {
  it("reads Portuguese and English field names, UTMs and click ids", () => {
    const lead = leadFromWebsite(
      { nome: "Ana Exemplo", telefone: "(508) 555-0142", email: "ana@example.com", cep: "02601", cidade: "Hyannis", "serviço": "Interior", utm_source: "google", utm_campaign: "cape", utm_content: "v1", gclid: "g1", fbclid: "f1", "Como nos achou?": "Amigo" },
      "fallback"
    );
    expect(lead).toMatchObject({
      source: "WEBSITE",
      externalId: "fallback",
      pipelineKey: "website:fallback",
      name: "Ana Exemplo",
      phone: "(508) 555-0142",
      zipCode: "02601",
      city: "Hyannis",
      service: "Interior",
      details: { "Como nos achou?": "Amigo" },
      origin: { utmSource: "google", utmCampaign: "cape", utmContent: "v1", gclid: "g1", fbclid: "f1" },
    });
  });

  it("uses the sender's id when there is one", () => {
    expect(leadFromWebsite({ leadId: "abc", phone: "5085550142" }, "fallback")?.externalId).toBe("abc");
  });

  it("needs a way to reach the customer", () => {
    expect(leadFromWebsite({ nome: "Ana" }, "fallback")).toBeNull();
  });

  it("isn't confused by a field called constructor", () => {
    expect(leadFromWebsite({ phone: "5085550142", constructor: "Sim" }, "x")?.details).toEqual({ constructor: "Sim" });
  });
});

describe("leadFromOrion", () => {
  it("recognizes the same Facebook lead from any door", () => {
    expect(leadFromOrion({ leadId: "meta:111", source: "Meta" })).toMatchObject({ source: "META", externalId: "111", pipelineKey: "meta:111" });
  });

  it("files the chat with the website, and Local Services with Google", () => {
    expect(leadFromOrion({ leadId: "concierge:1", source: "Concierge" })).toMatchObject({ source: "WEBSITE", externalId: "concierge:1", pipelineSource: "Concierge" });
    expect(leadFromOrion({ leadId: "google:1", source: "Google" })).toMatchObject({ source: "GOOGLE_ADS", externalId: "google:1", pipelineSource: "Google" });
  });

  it("picks the ad out of what Make sends", () => {
    expect(leadFromOrion({ leadId: "meta:1", source: "Meta", details: { "Ad ID": "a1", "Form ID": "f1", Other: "x" } }).origin).toEqual({ adId: "a1", formId: "f1" });
  });

  it("picks UTMs out of a form's hidden fields", () => {
    expect(leadFromOrion({ leadId: "tally:1", source: "Website", details: { utm_source: "google", utm_campaign: "cape", gclid: "g1" } }).origin).toEqual({ utmSource: "google", utmCampaign: "cape", gclid: "g1" });
  });

  it("cuts an id to what its column holds", () => {
    expect(leadFromOrion({ leadId: "meta:1", source: "Meta", details: { "Ad ID": "1".repeat(150), "Ad name": "n".repeat(300) } }).origin).toEqual({ adId: "1".repeat(100), adName: "n".repeat(255) });
  });

  it("reads the campaign ORION names, ahead of an answer among the details", () => {
    const intake = leadFromOrion({
      leadId: "meta:1",
      source: "Meta",
      campaignId: " c1 ",
      campaignName: "Cape Cod Leads",
      adSetId: "s1",
      adSetName: "Interior",
      adId: "a1",
      formName: "Short Verified",
      details: { "Ad ID": "other", "Form ID": "f1" },
    });
    expect(intake.origin).toEqual({ campaignId: "c1", campaignName: "Cape Cod Leads", adsetId: "s1", adsetName: "Interior", adId: "a1", formId: "f1", formName: "Short Verified" });
    expect(intake).not.toHaveProperty("campaignId");
  });

  it("is dated only when the delivery says when", () => {
    expect(leadFromOrion({ leadId: "x", source: "Website" }).dated).toBe(false);
    expect(leadFromOrion({ leadId: "x", source: "Website", receivedAt: "2026-10-16T15:44:26+0000" }).dated).toBe(true);
  });
});

describe("attributionOf", () => {
  it("names the platform after the door when the sender doesn't", () => {
    expect(attributionOf(leadFromOrion({ leadId: "meta:1", source: "Meta", adSetId: "s1" }))).toEqual({ platform: "Meta", adSetId: "s1", externalLeadId: "meta:1" });
    expect(attributionOf(leadFromOrion({ leadId: "meta:1", source: "Meta", platform: "Instagram" }))).toMatchObject({ platform: "Instagram" });
    expect(attributionOf(leadFromGoogle({ lead_id: "g1", campaign_id: "c9", user_column_data: [{ column_id: "PHONE_NUMBER", string_value: "5085550142" }] } as never)!)).toMatchObject({ platform: "Google", campaignId: "c9", externalLeadId: "google-form:g1" });
  });

  it("keeps a website lead's traffic, UTMs and landing page, whole", () => {
    const page = `https://ispaintingcorp.com/painting-quote/?q=${"x".repeat(400)}`;
    expect(
      attributionOf(leadFromOrion({ leadId: "tally:1", source: "Website", trafficSource: "Paid search", utmMedium: "cpc", landingPage: page, idealTiming: "Spring", details: { utm_source: "google" } })),
    ).toEqual({ trafficSource: "Paid search", utmSource: "google", utmMedium: "cpc", landingPage: page, idealTiming: "Spring", externalLeadId: "tally:1" });
  });
});
