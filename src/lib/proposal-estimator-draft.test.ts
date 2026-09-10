import { describe, expect, it } from "vitest";
import { computeDraftProposalEstimateSummary } from "./proposal-estimator-draft";

const defaults = {
  defaultLaborCostRate: 50,
  defaultWcPercent: 3,
  defaultDesiredProfitMarginPercent: 35,
  defaultGlPercent: 7.5,
  defaultGeneralLiabilityMode: "PERCENT_OF_REVENUE" as const,
  defaultMassTaxRate: 5,
  defaultFederalTaxRate: 12,
  defaultWorkDayHours: 8,
};

describe("computeDraftProposalEstimateSummary", () => {
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
    expect(summary.totals.actualProfit).toBe(2587.5);
    expect(summary.totals.actualMarginPercent).toBe(47.05);
  });
});
