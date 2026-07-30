# Job Financial Health Scoring

This document defines the deterministic health scoring used by the Job Financials foundation.

Implementation source:
- `src/lib/job-financials/calculate-job-health.ts`

## Determinism

Scoring is deterministic.
It uses only numeric/job summary inputs and fixed thresholds.
No external AI service is called.

## Score Range

- Minimum score: `0`
- Maximum score: `100`
- Formula baseline: `100`
- Score formula:
  - `score = clamp(100 - categoryPenalty - marginPenalty - warningPenalty, 0, 100)`

## Factor Weights

Category utilization penalty per category:
- `over_budget`: `20`
- `at_risk`: `10`
- `watch`: `5`
- `on_track`: `0`

Margin penalty:
- `negative` margin: `30`
- `thin` margin: `15`
- `strong` margin: `0`

Warning penalty:
- Each warning except `not_enough_projection_data`: `3`
- `not_enough_projection_data`: `0` penalty

## Status Thresholds (Overall Health)

After penalties are applied:
- `score >= 80`: `healthy`
- `60 <= score < 80`: `watch`
- `40 <= score < 60`: `at_risk`
- `score < 40`: `critical`

## Margin Thresholds

- `grossMargin < 0`: `negative`
- `0 <= grossMargin < 15`: `thin`
- `grossMargin >= 15`: `strong`

## Missing Budgets

If a category budget is `0`, utilization comes from `calculate-budget-health.ts`:
- `committedCost > 0` with budget `0` drives utilization to `100%` and `over_budget`
- `committedCost = 0` with budget `0` remains `on_track`

The health score then penalizes based on the resulting category status.

## No Contract Value

Revenue fallback is handled in financial summary generation:
- `contractAmount` is used when > 0
- otherwise `totalEstimate` is used

Health scoring itself consumes `grossMargin` and category statuses already computed from that revenue base.

## Insufficient Data

When projection data is insufficient, warning `not_enough_projection_data` is added.
This warning is informational and does not reduce score.

## Pending Costs Treatment

Health category status uses committed utilization, where:
- `committedCost = actualCost + pendingCost`

So pending costs can move categories from `on_track` to `watch`, `at_risk`, or `over_budget` before actual overruns occur.

## Warning Generation Rationale

Warnings in summary are generated in `buildJobFinancialSummary`:
- `not_enough_projection_data`:
  - emitted when pending labor, pending expenses, and pending subcontractor costs are all zero
  - reason: projections are less informative without pending pipeline
- `over_budget_category`:
  - emitted once per category where budget health status is `over_budget`
  - reason: direct budget overrun alert for operational action
