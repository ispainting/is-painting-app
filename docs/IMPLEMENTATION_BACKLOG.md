# Implementation Backlog

## Scope and Constraints
- This backlog is based on the real user audit for turning the current skeleton into a real business operating system for I.S. Painting.
- This document defines implementation priorities and commit slicing only.
- Guardrails:
	- No app code changes in this document update.
	- No Prisma/schema changes in this document update.
	- No UI redesign work in this document update.

## Prioritization Logic
- **Phase 1 (Operational Core):** Modules required for daily dispatch, time capture, lead handling, and billing workflow continuity.
- **Phase 2 (Controls and Efficiency):** Modules that tighten approvals, costs, automation reliability, and operational controls.
- **Phase 3 (Optimization and Scale):** Modules that improve profitability intelligence, governance depth, and advanced integrations.

---

## Phase 1 - Operational Core (Highest Priority)

### 1) Dashboard
**Current problem**
- Dashboard is too simple and does not support daily operating decisions.

**Required features**
- Leads from Meta Ads, Google Ads, website form, and manual entry.
- Lead source tracking and visibility.
- Integration connection plan for website form and ad agents/apps.
- Today active jobs widget.
- Employees currently clocked in widget.
- Pending approvals widget.
- Open invoices widget.
- Job profitability alerts.
- Follow-up alerts.

**Recommended small commits**
- `feat(dashboard): add KPI card shells for active jobs, clocked-in employees, pending approvals, open invoices`
- `feat(dashboard): add lead intake summary grouped by source`
- `feat(dashboard): add follow-up and profitability alert panels`
- `docs(integrations): define website form + ad agent ingestion contract and failure handling`

### 2) Jobs / Projects
**Current problem**
- New job modal is too simple; there is no usable project workspace.

**Required features**
- Clickable job detail workspace.
- Edit job.
- Status flow: estimate, sent, approved, active, on hold, canceled, completed.
- Labor planning: estimated hours, workers, hourly rates, total labor cost.
- Materials planning: material type, quantity, cost, markup, charge to customer.
- Subcontractor planning: vendor, cost, charge to customer, profit.
- Payment tracking: deposit received, check received, balance due.
- Expenses tied to project.
- Time entries tied to project.
- Invoices tied to project.
- Profitability estimate vs actual.
- Create invoice from job.

**Recommended small commits**
- `feat(jobs): add clickable job detail workspace route with read model`
- `feat(jobs): implement editable job header and status workflow`
- `feat(jobs): add labor planning section with estimated labor cost rollup`
- `feat(jobs): add materials and subcontractor planning with markup/profit fields`
- `feat(jobs): add project financial tab (payments, linked expenses, linked time, linked invoices)`
- `feat(jobs): add estimate-vs-actual profitability summary and invoice handoff action`

### 3) Opportunities / Leads
**Current problem**
- Opportunity cards are not useful/clickable enough and lifecycle tracking is weak.

**Required features**
- Clickable opportunity detail.
- Lead source tracking.
- Automation history/messages sent.
- Follow-up dates.
- Notes.
- Convert lead to estimate/job/customer.
- Pipeline stages similar to GoHighLevel.
- Meta Ads and website form integration plan.

**Recommended small commits**
- `feat(opportunities): add opportunity detail workspace route`
- `feat(opportunities): implement stage pipeline with ordered transitions and activity timestamps`
- `feat(opportunities): add follow-up date + notes + source fields`
- `feat(opportunities): add conversion actions to estimate, job, and customer`
- `feat(opportunities): display automation history/messages timeline`
- `docs(integrations): define Meta Ads and website form mapping into opportunity intake`

### 4) Customers
**Current problem**
- Customers cannot be clicked/edited; no unified account workspace exists.

**Required features**
- Customer detail workspace.
- Edit customer info.
- Merge/delete duplicate customers.
- Customer jobs.
- Customer opportunities.
- Customer invoices.
- Notes/timeline/documents.
- Lead source history.

**Recommended small commits**
- `feat(customers): add clickable customer detail workspace`
- `feat(customers): implement edit customer profile and contact info`
- `feat(customers): add related records tabs (jobs, opportunities, invoices)`
- `feat(customers): add notes/timeline/documents section`
- `feat(customers): implement duplicate detection with merge/delete flow`
- `feat(customers): surface lead source history timeline`

### 5) Time / Payroll
**Current problem**
- Admin can only approve; time management and payroll controls are incomplete.

**Required features**
- Edit time entries.
- Change job on a time entry.
- Manual time entry when employee forgot clock in/out.
- Split time across multiple jobs.
- Adjust break minutes.
- Approve/reject.
- Gross hours vs paid hours.
- Payroll export.
- Employee/job/date filters.

**Recommended small commits**
- `feat(time): add admin edit flow for time entries including job reassignment`
- `feat(time): add manual time entry creation with validation`
- `feat(time): add split entry workflow across multiple jobs`
- `feat(time): add break minute adjustments and gross-vs-paid hour calculations`
- `feat(time): add employee/job/date filters and approval queue improvements`
- `feat(payroll): add payroll export endpoint and download action`

### 6) Invoices
**Current problem**
- Invoice flow claims create-from-job but job flow is incomplete, causing process breaks.

**Required features**
- Create invoice from job.
- Create invoice manually.
- PDF invoice.
- Send invoice by email.
- Payment tracking.
- Partial payments.
- Remaining balance.
- Invoice status.

**Recommended small commits**
- `feat(invoices): implement invoice creation from job financial context`
- `feat(invoices): add manual invoice creation flow`
- `feat(invoices): add invoice status lifecycle and balance calculations`
- `feat(invoices): support partial payment recording and remaining balance updates`
- `feat(invoices): add PDF generation`
- `feat(invoices): add send-by-email workflow with send log`

---

## Phase 2 - Controls and Efficiency

### 7) Expenses
**Current problem**
- Expenses module cannot add expenses and does not feed project profitability reliably.

**Required features**
- Add expense.
- Upload receipt.
- Assign expense to job.
- Category/vendor/payment method.
- Approve/reject.
- Reimburse employee.
- Include expenses in job profitability.

**Recommended small commits**
- `feat(expenses): add create expense flow with category/vendor/payment method`
- `feat(expenses): add receipt upload and attachment preview metadata`
- `feat(expenses): add job assignment and approval/rejection workflow`
- `feat(expenses): add employee reimbursement tracking`
- `feat(expenses): include approved expenses in project profitability rollups`

### 8) Inventory
**Current problem**
- Inventory is read-only and disconnected from project cost outcomes.

**Required features**
- Add/edit/delete inventory item.
- Low-stock alerts.
- Material usage tied to job.
- Vendor/cost history.
- Inventory cost feeding into project profitability.

**Recommended small commits**
- `feat(inventory): add CRUD for inventory items`
- `feat(inventory): add low-stock thresholds and alert queue`
- `feat(inventory): track material usage transactions by job`
- `feat(inventory): add vendor and unit cost history per item`
- `feat(inventory): feed consumed material costs into project profitability`

### 9) Automations
**Current problem**
- Automation functionality is unclear and lacks operator confidence.

**Required features**
- Edit automation templates.
- Enable/disable and save.
- View messages sent.
- Test automation.
- Connect automation events to opportunity/customer timeline.
- Future SMS/email provider integration path.

**Recommended small commits**
- `feat(automations): add template edit + save + validation`
- `feat(automations): add enable/disable toggles with persisted state`
- `feat(automations): add sent message log view`
- `feat(automations): add test-send workflow for templates`
- `feat(automations): write automation events into opportunity/customer timelines`
- `docs(automations): define provider abstraction for future SMS/email integrations`

### 10) Employees
**Current problem**
- Employee management is too simple for payroll and labor controls.

**Required features**
- Edit employee.
- Set regular rate.
- Set island rate.
- Set role/permissions.
- Deactivate employee.
- Time history.
- Payroll summary.

**Recommended small commits**
- `feat(employees): add editable employee profile and status (active/deactivated)`
- `feat(employees): add regular and island pay rate management`
- `feat(employees): add role/permission assignment UI + enforcement checks`
- `feat(employees): add employee time history view`
- `feat(employees): add payroll summary panel per employee`

---

## Phase 3 - Optimization and Scale

### 11) Settings
**Current problem**
- Settings are too basic and do not support production defaults or governance.

**Required features**
- Real company info.
- Logo.
- Payment methods.
- Default pricing rates.
- Default burden/markup/tax.
- Lead source settings.
- Automation settings.
- User permissions.

**Recommended small commits**
- `feat(settings): add company profile settings including logo metadata`
- `feat(settings): add payment method configuration`
- `feat(settings): add default pricing, burden, markup, and tax settings`
- `feat(settings): add lead source dictionary management`
- `feat(settings): add automation settings and defaults`
- `feat(settings): centralize user permission policy controls`

---

## Cross-Module Dependency Notes
- Jobs should become the financial anchor for time, expenses, materials, invoices, and profitability.
- Opportunities should become the intake anchor for source tracking, follow-ups, and automations.
- Dashboard should read from standardized aggregates, not per-page custom calculations.
- Payroll and profitability should share a single source of truth for approved time and approved costs.

## Recommended Next 5 Commits (Exact Order)
1. `feat(jobs): add clickable job detail workspace with editable status workflow`
2. `feat(opportunities): add opportunity detail with pipeline stages, source, notes, and follow-up`
3. `feat(dashboard): add operations widgets (active jobs, clocked-in staff, pending approvals, open invoices)`
4. `feat(time): add admin time entry edit/manual entry/split entry with gross-vs-paid calculations`
5. `feat(invoices): implement create-from-job plus invoice status, partial payments, and remaining balance`

## Suggested Commit Message For This Docs Update
- `docs: expand implementation backlog from user audit`

---

## Admin UX Polish Pass

### Objective
- Run a focused admin UX polish pass before the next feature build so the system feels consistent, fast to operate, and premium rather than MVP-level.

### Goals
1. Every table row should be clickable when it represents an entity.
2. Every major entity should have a detail view/workspace:
	- Job/Project
	- Customer
	- Opportunity/Lead
	- Employee
	- Invoice
	- Expense
3. Add missing Edit buttons where needed.
4. Add clear Create/Add buttons where missing.
5. Add loading states.
6. Add empty states.
7. Add Save/Cancel buttons to all forms and modals.
8. Standardize cards, spacing, typography, and button styles.
9. Make the app feel like a premium business operating system, not an MVP.

### Recommended Small Commits For Admin UX Polish
- `feat(admin-ux): make entity table rows clickable and route to detail workspaces`
- `feat(admin-ux): add missing Create/Add and Edit actions across admin modules`
- `feat(admin-ux): add standardized loading and empty states for list/detail screens`
- `feat(admin-ux): enforce Save/Cancel action pattern in forms and modals`
- `feat(admin-ux): apply shared UI standards for cards, spacing, typography, and buttons`

### Next 5 Small Commits (Exact Order)
1. `feat(admin-ux): make entity table rows clickable and route to detail workspaces`
2. `feat(admin-ux): add missing Create/Add and Edit actions across admin modules`
3. `feat(admin-ux): add standardized loading and empty states for list/detail screens`
4. `feat(admin-ux): enforce Save/Cancel action pattern in forms and modals`
5. `feat(admin-ux): apply shared UI standards for cards, spacing, typography, and buttons`

### Suggested Commit Message For This Docs Update
- `docs: add admin ux polish plan`
