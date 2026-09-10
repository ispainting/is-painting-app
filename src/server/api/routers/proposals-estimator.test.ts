import { describe, expect, it } from "vitest";
import { buildJobEstimateFromProposal } from "@/lib/proposal-pricing";
import {
  buildAuthoritativeProposalEstimate,
  buildProposalEstimatePersistence,
  buildProposalEstimateSnapshotFromSavedProposal,
  sanitizeSections,
} from "./proposals";

const defaults = {
  defaultLaborCostRate: 50,
  defaultWcPercent: 3,
  defaultDesiredProfitMarginPercent: 35,
  defaultGeneralLiabilityMode: "PERCENT_OF_REVENUE" as const,
  defaultGlPercent: 7.5,
  defaultMassTaxRate: 5,
  defaultFederalTaxRate: 12,
  defaultWorkDayHours: 8,
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
    estimateTargetMarginPercent: null,
    estimateTargetMarkupPercent: null,
    estimatePriceOverride: null,
    estimateSubcontractorCost: 0,
    estimateEquipmentCost: 0,
    estimateLogisticsCost: 0,
    estimateMiscProjectCost: 0,
    desiredProfitMarginPercent: 35,
    workersCompPercentOverride: 3,
    includeWorkersCompInRecommendedPrice: true,
    generalLiabilityMode: "PERCENT_OF_LABOR" as const,
    generalLiabilityPercent: 7,
    generalLiabilityFlatAmount: null,
    includeGeneralLiabilityInRecommendedPrice: true,
    massTaxRate: 5,
    federalTaxRate: 12,
    showTaxPlanning: true,
    includeTaxReserveInRecommendedPrice: false,
    otherCosts: [{ key: "travel", label: "Travel", amount: 120, includeInRecommendedPrice: true }],
    expectedStartDate: null,
    expectedEndDate: null,
    sections: [],
    options: [],
    attachments: [],
    paintColors: [],
    ...overrides,
  };
}

const sectionInput = {
  key: "kitchen-walls",
  templateKey: "custom_section",
  title: "Kitchen walls",
  description: "",
  bulletItems: [],
  notes: "",
  sortOrder: 0,
  areaName: "Kitchen",
  phaseName: "Painting",
  workCategoryLabel: "Main scope",
  estimateMethod: "LABOR_AND_MATERIALS" as const,
  priceVisibilityMode: "ITEMIZED" as const,
  clientNotes: "",
  internalNotes: "",
  laborLines: [
    {
      key: "labor-1",
      label: "Crew",
      mode: "HOURS" as const,
      workers: 2,
      hoursPerWorker: 8,
      days: null,
      hoursPerDay: null,
      hourlyCost: 50,
      manualTotalOverride: null,
      internalNote: "",
    },
  ],
  materials: [
    {
      key: "material-1",
      inventoryItemId: 10,
      type: "CATALOG" as const,
      name: "Wall paint",
      unit: "gallon",
      quantity: 4,
      unitCost: 40,
      manualTotal: null,
      coveragePerUnit: null,
      wastePercent: 0,
      adjustedQuantity: null,
      note: "",
      priceSourceType: "INVENTORY_DEFAULT" as const,
      priceSourceLabel: "Latest catalog price",
      priceSourceExpenseId: null,
      priceSourceExpenseLineItemId: null,
      sortOrder: 0,
    },
  ],
  unitPrice: null,
  manualTotal: null,
  production: null,
};

describe("proposal estimator server authority", () => {
  it("persists authoritative hybrid estimator totals", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const authoritative = buildAuthoritativeProposalEstimate(sections, baseInput({ sections: [sectionInput] }), defaults);
    const persisted = buildProposalEstimatePersistence(authoritative, baseInput({ sections: [sectionInput] }), defaults);

    expect(sections[0]?.estimateMethod).toBe("LABOR_AND_MATERIALS");
    expect(sections[0]?.materials[0]?.materialCostSnapshot).toBe(160);
    expect(authoritative?.estimate.directLaborCost).toBe(800);
    expect(authoritative?.estimate.materialsCost).toBe(160);
    expect(authoritative?.estimate.totalInternalCost).toBe(1160);
    expect(persisted.estimateEngineVersion).toBe(2);
    expect(persisted.estimateRecommendedSellingPrice).toBe(1784.62);
    expect(persisted.estimateTrueJobCost).toBe(1160);
    expect(persisted.estimateGrossMarginPercent).toBe(35);
  });

  it("uses the selected workers comp and general liability inputs instead of legacy defaults", () => {
    const sections = sanitizeSections([sectionInput], { ...defaults, defaultWcPercent: 17.5, defaultGlPercent: 2 });
    const authoritative = buildAuthoritativeProposalEstimate(
      sections,
      baseInput({
        sections: [sectionInput],
        workersCompPercentOverride: 3,
        generalLiabilityMode: "PERCENT_OF_LABOR",
        generalLiabilityPercent: 7,
      }),
      { ...defaults, defaultWcPercent: 17.5, defaultGlPercent: 2 }
    );
    const persisted = buildProposalEstimatePersistence(
      authoritative,
      baseInput({
        sections: [sectionInput],
        workersCompPercentOverride: 3,
        generalLiabilityMode: "PERCENT_OF_LABOR",
        generalLiabilityPercent: 7,
      }),
      { ...defaults, defaultWcPercent: 17.5, defaultGlPercent: 2 }
    );

    expect(authoritative?.estimate.workersCompPercent).toBe(3);
    expect(authoritative?.estimate.workersCompAmount).toBe(24);
    expect(authoritative?.estimate.generalLiabilityAmount).toBe(56);
    expect(persisted.estimateLaborBurdenCost).toBe(80);
  });

  it("keeps the recommendation while allowing a final price override", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const input = baseInput({ sections: [sectionInput], estimatePriceOverride: 2000 });
    const authoritative = buildAuthoritativeProposalEstimate(sections, input, defaults);
    const persisted = buildProposalEstimatePersistence(authoritative, input, defaults);

    expect(authoritative?.estimate.recommendedCustomerPrice).toBe(1784.62);
    expect(authoritative?.estimate.finalCustomerPrice).toBe(2000);
    expect(persisted.estimateRecommendedSellingPrice).toBe(1784.62);
    expect(persisted.estimateFinalProposalPrice).toBe(2000);
  });

  it("supports coverage-based material quantities when manual quantity is blank", () => {
    const sections = sanitizeSections([
      {
        ...sectionInput,
        materials: [
          {
            ...sectionInput.materials[0],
            quantity: 0,
            coveragePerUnit: 350,
            wastePercent: 10,
            adjustedQuantity: null,
          },
        ],
        production: {
          workCategory: "INTERIOR",
          surfaceType: "Walls",
          measurementUnit: "SQFT",
          measurementValue: 620,
          productionRateBasis: "SQFT_PER_HOUR" as const,
          productionRateValue: 0,
          calculatedLaborHours: null,
          adjustedLaborHours: null,
          crewSize: null,
          hoursPerDay: null,
          hourlyCostPerWorker: null,
          note: "",
          productionRateId: null,
        },
      },
    ], defaults);

    expect(sections[0]?.materials[0]?.calculatedQuantity).toBe(1.95);
    expect(sections[0]?.materials[0]?.quantity).toBe(1.95);
    expect(sections[0]?.materials[0]?.materialCostSnapshot).toBe(78);
  });

  it("keeps saved snapshots stable after later config changes", () => {
    const sections = sanitizeSections([sectionInput], defaults);
    const authoritative = buildAuthoritativeProposalEstimate(sections, baseInput({ sections: [sectionInput] }), defaults);
    const persisted = buildProposalEstimatePersistence(authoritative, baseInput({ sections: [sectionInput] }), defaults);
    const changedDefaults = {
      ...defaults,
      defaultLaborCostRate: 200,
      defaultWcPercent: 17.5,
      defaultGlPercent: 15,
      defaultDesiredProfitMarginPercent: 50,
    };

    expect(sections[0]?.materials[0]?.unitCostSnapshot).toBe(40);
    expect(persisted.estimateTrueJobCost).toBe(1160);
    expect(changedDefaults.defaultLaborCostRate).toBe(200);
  });

  it("preserves saved summaries for job conversion", () => {
    const snapshot = buildProposalEstimateSnapshotFromSavedProposal({
      totalAmount: 1,
      estimateFinalProposalPrice: 5500,
      estimateSummaryJson: {
        summary: {
          workItems: [
            {
              title: "Cabinet refinishing",
              totalWorkerHours: 12,
              allocatedCustomerPrice: 5500,
              materialsCost: 700,
              materialLines: [
                {
                  name: "Milesi topcoat",
                  unit: "gallon",
                  quantity: 2,
                  unitCost: 125,
                  lineTotal: 250,
                },
              ],
            },
          ],
        },
      },
      sections: [],
    });

    const seed = buildJobEstimateFromProposal(snapshot);
    expect(seed.totalEstimate).toBe(5500);
    expect(seed.materialsBudget).toBe(700);
    expect(seed.laborBudget).toBe(5500);
    expect(seed.materials[0]?.name).toBe("Cabinet refinishing — Milesi topcoat");
    expect(seed.materials[0]?.totalCost).toBe(250);
    expect(seed.labor[0]?.hours).toBe(12);
  });

  it("falls back to legacy saved section snapshots when estimateSummaryJson is absent", () => {
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
    expect(seed.materials[0]?.totalCost).toBe(156);
    expect(seed.labor[0]?.hours).toBe(8);
  });
});
