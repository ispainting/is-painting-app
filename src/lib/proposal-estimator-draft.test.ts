import { describe, expect, it } from "vitest";
import { computeDraftProposalEstimateSummary } from "./proposal-estimator-draft";

const defaults = {
  defaultLaborCostRate: 50,
  defaultWcPercent: 3,
  defaultDesiredProfitMarginPercent: 35,
  defaultGlPercent: 1,
  defaultGeneralLiabilityMode: "PERCENT_OF_REVENUE" as const,
  defaultMassTaxRate: 5,
  defaultFederalTaxRate: 12,
  defaultWorkDayHours: 8,
};

describe("computeDraftProposalEstimateSummary", () => {
  it("defaults new labor group to $23/hr when no company default exists", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults: { ...defaults, defaultLaborCostRate: null },
      pricing: { desiredProfitMarginPercent: "35", otherCosts: [] },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [],
          laborLines: [
            // hourlyCost left blank -> should fallback to $23
            { key: "hours", label: "Hourly crew", mode: "HOURS", workers: "3", hoursPerWorker: "40", hourlyCost: "" },
          ],
        },
      ],
    });

    expect(summary.totals.workItems[0]?.laborLines[0]?.usedLaborCost).toBe(2760); // 3 * 40 * 23 = 2760
    expect(summary.totals.directLaborCost).toBe(2760);
  });

  it("prioritizes configured company labor cost default over $23", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults: { ...defaults, defaultLaborCostRate: 30 },
      pricing: { desiredProfitMarginPercent: "35", otherCosts: [] },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [],
          laborLines: [
            { key: "hours", label: "Hourly crew", mode: "HOURS", workers: "2", hoursPerWorker: "10", hourlyCost: "" },
          ],
        },
      ],
    });

    expect(summary.totals.directLaborCost).toBe(600); // 2 * 10 * 30 = 600
  });

  it("preserves saved custom labor rate and updates totals when changed", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults: { ...defaults, defaultLaborCostRate: 50 },
      pricing: { desiredProfitMarginPercent: "35", otherCosts: [] },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [],
          laborLines: [
            // custom rate $28 should be preserved despite default $50
            { key: "hours", label: "Custom crew", mode: "HOURS", workers: "2", hoursPerWorker: "10", hourlyCost: "28" },
          ],
        },
      ],
    });

    expect(summary.totals.directLaborCost).toBe(560); // 2 * 10 * 28 = 560
  });

  it("calculates proposal-level hourly and daily labor without scope items", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: { desiredProfitMarginPercent: "35", otherCosts: [] },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [],
          laborLines: [
            { key: "hours", label: "Hourly crew", mode: "HOURS", workers: "3", hoursPerWorker: "40", hourlyCost: "23" },
            { key: "days", label: "Daily crew", mode: "DAYS", workers: "3", days: "5", hoursPerDay: "8", hourlyCost: "23" },
            { key: "manual", label: "Manual phase", mode: "HOURS", workers: "0", hourlyCost: "0", manualTotalOverride: "900" },
          ],
        },
      ],
    });

    expect(summary.hasEstimatorData).toBe(true);
    expect(summary.totals.workItems).toHaveLength(1);
    expect(summary.totals.workItems[0]?.laborLines.map((line) => line.calculatedLaborCost)).toEqual([2760, 2760, 0]);
    expect(summary.totals.directLaborCost).toBe(6420);
  });

  it("calculates multiple simple material amounts correctly and supports manual total", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: { desiredProfitMarginPercent: "35", otherCosts: [] },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-materials",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          laborLines: [],
          materials: [
            { key: "m1", type: "CUSTOM", name: "Paint", unit: "unit", quantity: "1", unitCost: "900", manualTotal: "900" },
            { key: "m2", type: "CUSTOM", name: "Primer", unit: "unit", quantity: "1", unitCost: "800", manualTotal: "800" },
            { key: "m3", type: "CUSTOM", name: "Sandpaper", unit: "unit", quantity: "1", unitCost: "600", manualTotal: "600" },
            { key: "m4", type: "CUSTOM", name: "Plastic and protection", unit: "unit", quantity: "1", unitCost: "200", manualTotal: "200" },
          ],
        },
      ],
    });

    expect(summary.totals.materialsCost).toBe(2500); // 900 + 800 + 600 + 200 = 2500
  });

  it("uses 1% general-liability allocation fallback for new proposal when no company GL exists", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults: { ...defaults, defaultGlPercent: 0 },
      pricing: {
        desiredProfitMarginPercent: "35",
        generalLiabilityMode: "PERCENT_OF_REVENUE",
        generalLiabilityPercent: "", // left blank -> fallback 1%
        otherCosts: [],
      },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [{ key: "m1", type: "CUSTOM", name: "Paint", unit: "unit", quantity: "1", unitCost: "1000", manualTotal: "1000" }],
          laborLines: [],
        },
      ],
    });

    expect(summary.totals.generalLiabilityPercent).toBe(1);
    expect(summary.totals.generalLiabilityAmount).toBeGreaterThan(0);
  });

  it("prioritizes configured company general liability rate over 1%", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults: { ...defaults, defaultGlPercent: 2.5 },
      pricing: {
        desiredProfitMarginPercent: "35",
        generalLiabilityMode: "PERCENT_OF_REVENUE",
        generalLiabilityPercent: "", // left blank -> should use configured 2.5%
        otherCosts: [],
      },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [{ key: "m1", type: "CUSTOM", name: "Paint", unit: "unit", quantity: "1", unitCost: "1000", manualTotal: "1000" }],
          laborLines: [],
        },
      ],
    });

    expect(summary.totals.generalLiabilityPercent).toBe(2.5);
  });

  it("keeps blank final customer price equal to recommended price and applies entered override", () => {
    // Blank override
    const blankSummary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: {
        desiredProfitMarginPercent: "35",
        estimatePriceOverride: "",
        otherCosts: [],
      },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [{ key: "m1", type: "CUSTOM", name: "Paint", unit: "unit", quantity: "1", unitCost: "1000", manualTotal: "1000" }],
          laborLines: [],
        },
      ],
    });

    expect(blankSummary.totals.finalCustomerPrice).toBe(blankSummary.totals.recommendedCustomerPrice);

    // Entered override
    const overrideSummary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: {
        desiredProfitMarginPercent: "35",
        estimatePriceOverride: "2500",
        otherCosts: [],
      },
      sections: [],
      estimateWorkItems: [
        {
          key: "pricing-labor",
          templateKey: "pricing",
          title: "Labor and materials",
          areaName: "",
          priceVisibilityMode: "HIDDEN",
          estimateMethod: "LABOR_AND_MATERIALS",
          materials: [{ key: "m1", type: "CUSTOM", name: "Paint", unit: "unit", quantity: "1", unitCost: "1000", manualTotal: "1000" }],
          laborLines: [],
        },
      ],
    });

    expect(overrideSummary.totals.finalCustomerPrice).toBe(2500);
    expect(overrideSummary.totals.recommendedCustomerPrice).not.toBe(2500);
    expect(overrideSummary.totals.actualProfit).toBeGreaterThan(0);
  });

  it("calculates hourly labor, material totals, taxes, and owner take-home", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: {
        desiredProfitMarginPercent: "35",
        workersCompPercentOverride: "3",
        includeWorkersCompInRecommendedPrice: true,
        generalLiabilityMode: "PERCENT_OF_LABOR",
        generalLiabilityPercent: "7",
        includeGeneralLiabilityInRecommendedPrice: true,
        massTaxRate: "5",
        federalTaxRate: "12",
        showTaxPlanning: true,
        includeTaxReserveInRecommendedPrice: false,
        otherCosts: [
          { key: "travel", label: "Fuel", amount: "120", includeInRecommendedPrice: true },
        ],
      },
      sections: [
        {
          key: "kitchen-walls",
          templateKey: "custom_section",
          title: "Kitchen walls",
          areaName: "Kitchen",
          priceVisibilityMode: "ITEMIZED",
          estimateMethod: "LABOR_AND_MATERIALS",
          laborLines: [
            {
              key: "labor-1",
              label: "Prep and paint",
              mode: "HOURS",
              workers: "2",
              hoursPerWorker: "8",
              days: "",
              hoursPerDay: "",
              hourlyCost: "50",
              manualTotalOverride: "",
              internalNote: "",
            },
          ],
          materials: [
            {
              key: "material-1",
              type: "CATALOG",
              name: "Wall paint",
              unit: "gallon",
              quantity: "4",
              unitCost: "40",
              manualTotal: "",
              coveragePerUnit: "",
              wastePercent: "0",
              adjustedQuantity: "",
              note: "",
              priceSourceType: "INVENTORY_DEFAULT",
              priceSourceLabel: "Latest catalog price",
              priceSourceExpenseId: null,
              priceSourceExpenseLineItemId: null,
            },
          ],
        },
      ],
    });

    expect(summary.areas[0]?.allocatedCustomerPrice).toBe(summary.totals.finalCustomerPrice);
    expect(summary.totals.directLaborCost).toBe(800);
    expect(summary.totals.materialsCost).toBe(160);
    expect(summary.totals.otherDirectCosts).toBe(120);
    expect(summary.totals.workersCompAmount).toBe(24);
    expect(summary.totals.generalLiabilityAmount).toBe(56);
    expect(summary.totals.totalInternalCost).toBe(1160);
    expect(summary.totals.recommendedCustomerPrice).toBe(1784.62);
    expect(summary.totals.massTaxAmount).toBeGreaterThan(0);
    expect(summary.totals.estimatedOwnerTakeHome).toBeGreaterThan(0);
  });

  it("supports unit-price work with a final total override", () => {
    const summary = computeDraftProposalEstimateSummary({
      defaults,
      pricing: {
        desiredProfitMarginPercent: "35",
        estimatePriceOverride: "5500",
        otherCosts: [],
      },
      sections: [
        {
          key: "cabinets",
          templateKey: "cabinets",
          title: "Cabinet refinishing",
          areaName: "Kitchen",
          priceVisibilityMode: "ITEMIZED",
          estimateMethod: "UNIT_PRICE",
          laborLines: [],
          materials: [],
          unitPrice: {
            templateId: 1,
            serviceName: "Cabinet refinishing",
            variantName: "Milesi",
            unitLabel: "Door",
            quantity: "40",
            pricePerUnit: "135",
            lineTotalOverride: "",
            laborAllowance: "1800",
            materialAllowance: "700",
            note: "",
            rateSource: "SEEDED",
          },
        },
      ],
    });

    expect(summary.totals.recommendedCustomerPrice).toBe(5400);
    expect(summary.totals.finalCustomerPrice).toBe(5500);
    expect(summary.totals.actualProfit).toBe(2945);
    expect(summary.totals.actualMarginPercent).toBe(53.55);
  });
});
