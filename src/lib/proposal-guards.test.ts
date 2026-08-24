import { describe, expect, it } from "vitest";
import { assertCustomerLinked, canPerformAction, isProposalLinked, ProposalNotLinkedError } from "./proposal-guards";

describe("isProposalLinked", () => {
  it("is false for a draft without a client", () => {
    expect(isProposalLinked({ customerId: null })).toBe(false);
  });

  it("is true once a client is linked", () => {
    expect(isProposalLinked({ customerId: 42 })).toBe(true);
  });
});

describe("draft without client", () => {
  it("allows estimating (no guard invoked) while customerId is null", () => {
    const draft = { customerId: null, status: "draft" as const };
    expect(isProposalLinked(draft)).toBe(false);
    // Estimating/saving a draft never calls assertCustomerLinked, so no error path exists for it.
  });
});

describe("link client later", () => {
  it("becomes linked and permitted once customerId is set", () => {
    const before = { customerId: null };
    const after = { customerId: 7 };
    expect(canPerformAction(before, "send")).toBe(false);
    expect(canPerformAction(after, "send")).toBe(true);
  });
});

describe("prevent sending unlinked proposal", () => {
  it("throws ProposalNotLinkedError for send", () => {
    expect(() => assertCustomerLinked({ customerId: null }, "send")).toThrow(ProposalNotLinkedError);
  });

  it("throws for approve", () => {
    expect(() => assertCustomerLinked({ customerId: null }, "approve")).toThrow(/Link a customer/);
  });

  it("throws for convert_to_job", () => {
    expect(() => assertCustomerLinked({ customerId: null }, "convert_to_job")).toThrow(/convert to a Job/);
  });

  it("does not throw once linked", () => {
    expect(() => assertCustomerLinked({ customerId: 1 }, "send")).not.toThrow();
    expect(() => assertCustomerLinked({ customerId: 1 }, "approve")).not.toThrow();
    expect(() => assertCustomerLinked({ customerId: 1 }, "convert_to_job")).not.toThrow();
  });
});
