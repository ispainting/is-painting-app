# Job Budget Fields Plan (Phase 1)

## Scope

This plan keeps budget categories directly on `Job` with exactly six fields:

- laborBudget
- materialsBudget
- equipmentBudget
- subcontractorBudget
- travelBudget
- otherBudget

Existing `Job` fields stay as-is:

- materialsBudget
- laborBudget
- subcontractorBudget

New fields introduced:

- equipmentBudget DECIMAL(12,2) NOT NULL DEFAULT 0
- travelBudget DECIMAL(12,2) NOT NULL DEFAULT 0
- otherBudget DECIMAL(12,2) NOT NULL DEFAULT 0

## Backfill Mapping

No row-copy backfill is required in this phase.

Existing rows auto-initialize to 0 for:

- equipmentBudget
- travelBudget
- otherBudget

Current values for existing categories continue in place:

- laborBudget
- materialsBudget
- subcontractorBudget

## Safety

- Migration is additive only (3 columns).
- Existing rows are preserved and defaulted safely.
- Existing budget fields are not removed or deprecated.

## Verification Queries

Check column defaults and values for a sample:

```sql
SELECT
  "id",
  "laborBudget",
  "materialsBudget",
  "subcontractorBudget",
  "equipmentBudget",
  "travelBudget",
  "otherBudget"
FROM "Job"
WHERE "id" IN (1, 4)
ORDER BY "id";
```

## Rollback Plan

If this migration must be rolled back before dependent features are deployed:

```sql
ALTER TABLE "Job"
DROP COLUMN IF EXISTS "equipmentBudget",
DROP COLUMN IF EXISTS "travelBudget",
DROP COLUMN IF EXISTS "otherBudget";
```

Rollback impact:

- Removes only the three new budget columns.
- Existing budget fields remain untouched.
