import { describe, expect, it } from "vitest";
import { computeDraftProposalEstimateSummary } from "./proposal-estimator-draft";

const defaults = {
  defaultLaborSellRate: 80,
  defaultLaborCostRate: 50,
  defaultMarkup: 25,
  defaultWcPercent: 3.5,
  defaultOverhead: 12,
  defaultProposalPricingMethod: "GROSS_MARGIN" as const,
};

describe("computeDraftProposalEstimateSummary", () => {
  it("rolls scope-item calculations into area totals and proposal totals", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: {
        estimatePricingMethod: "GROSS_MARGIN",
        estimateTargetMarginPercent: "30",
        estimateSubcontractorCost: 100,
        estimateEquipmentCost: 50,
        estimateLogisticsCost: 25,
        estimateMiscProjectCost: 10,
      },
      sections: [
        {
          title: "Kitchen walls",
          areaName: "Kitchen",
          workCategory: "INTERIOR",
          surfaceType: "Walls",
          measurementValue: "620",
          coats: "2",
          calculatedLaborHours: "7.29",
          adjustedLaborHours: "8",
          laborSellRateOverride: "",
          additionalCharges: "0",
          materials: [
            {
              name: "Wall paint",
              quantity: "",
              unitCost: "40",
              markupPercent: "25",
              coveragePerUnit: "350",
              wastePercent: "10",
              adjustedQuantity: "",
            },
          ],
        },
        {
          title: "Kitchen trim",
          areaName: "Kitchen",
          workCategory: "INTERIOR",
          surfaceType: "Trim",
          measurementValue: "120",
          coats: "2",
          calculatedLaborHours: "3",
          adjustedLaborHours: "",
          laborSellRateOverride: "",
          additionalCharges: "45",
          materials: [],
        },
      ],
    });

    expect(summary.areas).toHaveLength(1);
    expect(summary.areas[0]?.areaName).toBe("Kitchen");
    expect(summary.areas[0]?.painterHours).toBe(11);
    expect(summary.areas[0]?.materialCost).toBe(156);
    expect(summary.areas[0]?.subtotal).toBe(1120);
    expect(summary.totals.totalPainterHours).toBe(11);
    expect(summary.totals.directLaborCost).toBe(550);
    expect(summary.totals.laborBurdenCost).toBe(19.25);
    expect(summary.totals.loadedLaborCost).toBe(569.25);
    expect(summary.totals.materialCost).toBe(156);
    expect(summary.totals.trueJobCost).toBe(1019.48);
    expect(summary.totals.recommendedSellingPrice).toBe(1456.4);
  });

  it("keeps the recommendation while allowing a final-price override", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: {
        estimatePricingMethod: "MARKUP",
        estimateTargetMarkupPercent: "20",
        estimatePriceOverride: "1300",
      },
      sections: [
        {
          title: "Kitchen walls",
          areaName: "Kitchen",
          workCategory: "INTERIOR",
          surfaceType: "Walls",
          measurementValue: "620",
          coats: "2",
          calculatedLaborHours: "7.29",
          adjustedLaborHours: "8",
          laborSellRateOverride: "",
          additionalCharges: "0",
          materials: [
            {
              name: "Wall paint",
              quantity: "",
              unitCost: "40",
              markupPercent: "25",
              coveragePerUnit: "350",
              wastePercent: "10",
              adjustedQuantity: "",
            },
          ],
        },
      ],
    });

    expect(summary.totals.recommendedSellingPrice).toBe(766.08);
    expect(summary.totals.finalProposalPrice).toBe(1300);
    expect(summary.totals.grossProfitDollars).toBe(661.6);
    expect(summary.manualPriceOverride).toBe(1300);
  });
});
