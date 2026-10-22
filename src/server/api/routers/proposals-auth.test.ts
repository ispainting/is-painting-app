import { describe, expect, it } from "vitest";
import { proposalsRouter } from "./proposals";

describe("proposals router authorization", () => {
  it("blocks non-admin users from saving manual price overrides", async () => {
    const caller = proposalsRouter.createCaller({
      prisma: {} as never,
      session: {
        userId: 2,
        role: "employee",
        email: "employee@ispainting.com",
        name: "Estimator",
      },
    });

    await expect(
      caller.update({
        id: 1,
        data: {
          customerId: null,
          projectName: "Kitchen",
          status: "draft",
          totalAmount: 1300,
          materialsBudget: 0,
          laborBudget: 0,
          subcontractorBudget: 0,
          estimatePricingMethod: "MARKUP",
          estimateTargetMarkupPercent: 20,
          estimatePriceOverride: 1300,
          sections: [],
          options: [],
          attachments: [],
          paintColors: [],
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
