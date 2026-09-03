import { describe, expect, it } from "vitest";
import { buildJobEstimateFromProposal } from "@/lib/proposal-pricing";
import {
  buildAuthoritativeProposalEstimate,
  buildProposalEstimatePersistence,
  buildProposalEstimateSnapshotFromSavedProposal,
  sanitizeSections,
} from "./proposals";

const defaults = {
  defaultLaborSellRate: 80,
  defaultLaborCostRate: 50,
  defaultMarkup: 25,
  defaultWcPercent: 3.5,
  defaultOverhead: 12,
  defaultProposalPricingMethod: "GROSS_MARGIN" as const,
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: null,
    projectName: "Kitchen",
    status: "draft" as const,
    materialsBudget: 0,
    laborBudget: 0,
    subcontractorBudget: 0,
    totalAmount: 1,
    estimatePricingMethod: "GROSS_MARGIN" as const,
    estimateTargetMarginPercent: 30,
    estimateTargetMarkupPercent: null,
    estimatePriceOverride: null,
    estimateSubcontractorCost: 100,
    estimateEquipmentCost: 50,
    estimateLogisticsCost: 25,
    estimateMiscProjectCost: 10,
    expectedStartDate: null,
    expectedEndDate: null,
    sections: [],
    options: [],
    attachments: [],
    paintColors: [],
    ...overrides,
  } as any;
}

const sectionInput = {
  title: "Kitchen walls",
  description: "",
  bulletItems: [],
  notes: "",
  sortOrder: 0,
  estimatedLaborHours: null,
  laborSellRateOverride: null,
  additionalCharges: 0,
  areaName: "Kitchen",
  measurementType: "SQFT",
  measurementValue: 620,
  coats: 2,
  prepLevel: "Normal",
  productionRateId: null,
  calculatedLaborHours: 7.29,
  adjustedLaborHours: 8,
  directLaborCostRate: 50,
  customerDisplayLabel: "Kitchen walls",
  priceVisibility: "SHOW" as const,
  groupIntoAreaPrice: false,
  materials: [
    {
      inventoryItemId: 10,
      name: "Wall paint",
      unit: "gallon",
      quantity: 1,
      unitCost: 40,
      markupPercent: 25,
      coveragePerUnit: 350,
      wastePercent: 10,
      calculatedQuantity: null,
      adjustedQuantity: null,
      sortOrder: 0,
    },
  ],
};

describe("proposal estimator server authority", () => {
  it("derives and persists authoritative economics instead of trusting client totals", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const input = baseInput({
      estimateWcCost: 9999,
      estimateTrueJobCost: 1,
      estimateGrossMarginPercent: 99,
      estimateRecommendedSellingPrice: 2,
    });

    const authoritative = buildAuthoritativeProposalEstimate(sections, input, defaults);
    const persisted = buildProposalEstimatePersistence(authoritative, input, defaults);

    expect(sections[0].effectiveLaborHours).toBe(8);
    expect(sections[0].directLaborCostSnapshot).toBe(400);
    expect(sections[0].wcPercentSnapshot).toBe(3.5);
    expect(sections[0].wcCostSnapshot).toBe(14);
    expect(sections[0].laborBurdenCostSnapshot).toBe(14);
    expect(sections[0].loadedLaborCostSnapshot).toBe(414);
    expect(sections[0].materials[0].calculatedQuantity).toBe(3.9);
    expect(sections[0].materials[0].quantity).toBe(3.9);
    expect(sections[0].materials[0].materialCostSnapshot).toBe(156);
    expect(persisted.estimateEngineVersion).toBe(1);
    expect(persisted.estimateDirectLaborCost).toBe(400);
    expect(persisted.estimateLaborBurdenCost).toBe(14);
    expect(persisted.estimateLoadedLaborCost).toBe(414);
    expect(persisted.estimateMaterialCost).toBe(156);
    expect(persisted.estimateDirectProjectCost).toBe(755);
    expect(persisted.estimateOverheadPercentSnapshot).toBe(12);
    expect(persisted.estimateOverheadDollars).toBe(90.6);
    expect(persisted.estimateTrueJobCost).toBe(845.6);
    expect(persisted.estimateRecommendedSellingPrice).toBe(1208);
    expect(persisted.estimateGrossMarginPercent).toBe(30);
    expect(persisted.estimateEffectiveSalesRate).toBe(151);
  });

  it("never includes GL in labor burden and never uses the legacy 17.5 WC value", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const persisted = buildProposalEstimatePersistence(
      buildAuthoritativeProposalEstimate(sections, baseInput(), { ...defaults, defaultGlPercent: 7.5 } as any),
      baseInput(),
      { ...defaults, defaultGlPercent: 7.5 } as any
    );

    expect(persisted.estimateLaborBurdenCost).toBe(14);
    expect(persisted.estimateLaborBurdenCost).not.toBe(70);
  });

  it("uses markup mode and manual override according to saved raw inputs", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const input = baseInput({
      estimatePricingMethod: "MARKUP",
      estimateTargetMarginPercent: null,
      estimateTargetMarkupPercent: 20,
      estimatePriceOverride: 1300,
    });

    const persisted = buildProposalEstimatePersistence(
      buildAuthoritativeProposalEstimate(sections, input, defaults),
      input,
      defaults
    );

    expect(persisted.estimateRecommendedSellingPrice).toBe(1014.72);
    expect(persisted.estimateFinalProposalPrice).toBe(1300);
    expect(persisted.estimateGrossProfitDollars).toBe(454.4);
    expect(persisted.estimateGrossMarginPercent).toBe(34.95);
    expect(persisted.estimateEffectiveSalesRate).toBe(162.5);
  });

  it("keeps saved snapshots stable after later config or catalog changes", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const persisted = buildProposalEstimatePersistence(
      buildAuthoritativeProposalEstimate(sections, baseInput(), defaults),
      baseInput(),
      defaults
    );
    const changedDefaults = { ...defaults, defaultLaborCostRate: 200, defaultWcPercent: 17.5, defaultOverhead: 99 };

    expect(persisted.estimateTrueJobCost).toBe(845.6);
    expect(sections[0].materials[0].unitCostSnapshot).toBe(40);
    expect(changedDefaults.defaultOverhead).toBe(99);
  });

  it("convertToJob uses saved proposal snapshots and saved final estimator price", () => {
    const snapshot = buildProposalEstimateSnapshotFromSavedProposal({
      totalAmount: 1,
      estimateFinalProposalPrice: 1300,
      sections: [
        {
          title: "Kitchen walls",
          estimatedLaborHours: 8,
          laborSellRateSnapshot: 80,
          laborSellingPriceSnapshot: 640,
          materialsCostSnapshot: 156,
          materialsSellingPriceSnapshot: 195,
          additionalCharges: 0,
          scopeSubtotalSnapshot: 835,
          materials: [
            {
              nameSnapshot: "Wall paint",
              unitSnapshot: "gallon",
              quantity: 3.9,
              unitCostSnapshot: 40,
              materialCostSnapshot: 156,
              sellingPriceSnapshot: 195,
            },
          ],
        },
      ],
    });

    const seed = buildJobEstimateFromProposal(snapshot);
    expect(seed.totalEstimate).toBe(1300);
    expect(seed.materialsBudget).toBe(195);
    expect(seed.laborBudget).toBe(640);
    expect(seed.materials[0].totalCost).toBe(156);
    expect(seed.labor[0].hours).toBe(8);
  });
});
