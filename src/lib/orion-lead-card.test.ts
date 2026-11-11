import { describe, expect, it } from "vitest";
import {
  betterOpportunityName,
  blankCustomerFields,
  leadCardLines,
  leadCardNote,
  leadOpportunityName,
  NOT_PROVIDED,
  readable,
  replacesNote,
} from "./orion-lead-card";

const noContact = { email: null, phone: null, address: null, city: null, state: null, zipCode: null };

describe("readable", () => {
  it("turns Facebook's answer keys into words", () => {
    expect(readable("interior")).toBe("Interior");
    expect(readable("cabinet_painting_/_refinishing")).toBe("Cabinet painting / refinishing");
    expect(readable("what_type_of_painting_service_do_you_need?")).toBe("What type of painting service do you need?");
    expect(readable("1_3_months")).toBe("1-3 months");
  });

  it("leaves what a person typed alone", () => {
    expect(readable("Deck Staining / Restoration")).toBe("Deck Staining / Restoration");
    expect(readable("Falmouth")).toBe("Falmouth");
    expect(readable("https://example.com/inbox_url")).toBe("https://example.com/inbox_url");
  });
});

describe("leadCardLines", () => {
  it("puts the town first, then the service", () => {
    const lines = leadCardLines({ city: "Falmouth", service: "interior", name: "A B", phone: "+15085550100" });
    expect(lines[0]).toBe("Town: Falmouth");
    expect(lines[1]).toBe("Service: Interior");
  });

  it("shows the out-of-area flag right under the town", () => {
    const lines = leadCardLines({ city: "Boston", service: "interior", details: { Campaign: "Cape Cod", "Service area": "Outside the service map, does not count as a lead" } });
    expect(lines[1]).toBe("Service area: Outside the service map, does not count as a lead");
    expect(lines.filter((l) => l.startsWith("Service area"))).toHaveLength(1);
  });

  it("marks a blank question as not provided instead of inventing an answer", () => {
    const lines = leadCardLines({ service: "interior", name: "A B", phone: "+15085550100" });
    expect(lines).toContain(`Town: ${NOT_PROVIDED}`);
    expect(lines).toContain(`Email: ${NOT_PROVIDED}`);
    expect(lines).toContain(`ZIP: ${NOT_PROVIDED}`);
  });

  it("treats a blank answer as not provided", () => {
    expect(leadCardLines({ city: "   " })[0]).toBe(`Town: ${NOT_PROVIDED}`);
  });

  it("shows the questions most forms don't ask only when they were answered", () => {
    const without = leadCardNote({ name: "A B" });
    expect(without).not.toContain("Address:");
    expect(without).not.toContain("Message:");
    const answered = leadCardNote({ address: "1 Main St", message: "Two rooms" });
    expect(answered).toContain("Address: 1 Main St");
    expect(answered).toContain("Message: Two rooms");
  });

  it("keeps every other answer, with a readable label", () => {
    const lines = leadCardLines({ details: { "when_are_you_planning_to_start?": "1-3 months", "Campaign": "Cape Cod" } });
    expect(lines).toContain("When are you planning to start?: 1-3 months");
    expect(lines).toContain("Campaign: Cape Cod");
  });
});

describe("leadOpportunityName", () => {
  it("names the opportunity after the service and town", () => {
    expect(leadOpportunityName({ service: "interior", city: "Falmouth" })).toBe("Interior — Falmouth");
    expect(leadOpportunityName({ service: "Exterior Painting" })).toBe("Exterior Painting");
    expect(leadOpportunityName({})).toBe("Quote request");
  });
});

describe("blankCustomerFields", () => {
  it("fills what is empty", () => {
    expect(blankCustomerFields(noContact, { phone: "+15085550100", city: "Falmouth" })).toEqual({ phone: "+15085550100", city: "Falmouth" });
  });

  it("never overwrites what is already there", () => {
    const customer = { ...noContact, phone: "(508) 555-0199", city: "   " };
    expect(blankCustomerFields(customer, { phone: "+15085550100", city: "Falmouth" })).toEqual({ city: "Falmouth" });
  });

  it("does not touch the name", () => {
    expect(blankCustomerFields(noContact, { name: "A B" })).toEqual({});
  });
});

describe("replacesNote", () => {
  const nameOnly = leadCardNote({ name: "A B" });
  const full = leadCardNote({ name: "A B", phone: "+15085550100", service: "interior" });

  it("upgrades a card that arrived with less", () => {
    expect(replacesNote(nameOnly, nameOnly, full)).toBe(true);
  });

  it("upgrades the note format older leads were saved with", () => {
    const old = "service_type: interior\nForm: Cape Cod";
    expect(replacesNote(old, old, full)).toBe(true);
  });

  it("never replaces a note someone edited", () => {
    expect(replacesNote(`${nameOnly}\nCalled, call back Tuesday`, nameOnly, full)).toBe(false);
  });

  it("never swaps a fuller card for a thinner one", () => {
    expect(replacesNote(full, full, nameOnly)).toBe(false);
  });

  it("does nothing when the card is the same", () => {
    expect(replacesNote(full, full, full)).toBe(false);
  });
});

describe("betterOpportunityName", () => {
  it("replaces the automatic title once the service is known", () => {
    expect(betterOpportunityName("Quote request", { service: "interior" })).toBe("Interior");
  });

  it("adds the town to a title that only had the service", () => {
    expect(betterOpportunityName("Interior", { service: "interior", city: "Falmouth" })).toBe("Interior — Falmouth");
  });

  it("keeps a title someone wrote", () => {
    expect(betterOpportunityName("Smith kitchen repaint", { service: "interior", city: "Falmouth" })).toBeNull();
  });

  it("does not downgrade a title when a delivery has no service", () => {
    expect(betterOpportunityName("Interior", {})).toBeNull();
    expect(betterOpportunityName("Quote request", {})).toBeNull();
  });
});
