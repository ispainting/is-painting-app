# Implementation Backlog

## Current state
The repository already has the main application skeleton for an I.S. Painting business manager: Next.js app routes, Prisma models, tRPC routers, and a basic auth flow. The highest-value next step is to improve the employee-facing time tracking experience because it directly affects daily operations, payroll accuracy, and production visibility.

## Recommended next single small commit
### Improve the employee clock screen UX
**Why this should be next**
- It addresses a visible, user-facing workflow that affects real field staff daily.
- It improves clarity around whether an employee is clocked out, working, or on break.
- It supports production readiness without introducing schema or migration risk.

**Scope**
- Clearly show current status: Clocked Out, Working, or On Break
- Show current job name and customer when clocked in
- Show a large live timer while working
- Show a large live break timer while on break
- Show Start Break / End Break buttons only in the correct state
- Show a simple summary after clock out if feasible
- Keep the existing backend/API intact
- No schema changes
- No database migration
- No dashboard work
- No workspace framework work yet

**Suggested commit title**
- `feat: improve employee clock experience`

## Near-term backlog
### P1 — Business-impact workflow improvements
- Improve the employee clock experience and time tracking clarity.
- Make the time entry and payroll flow easier to understand for supervisors and employees.
- Smooth out obvious production issues from the current clock workflow.

### P2 — Core workflow completion
- Finish one end-to-end workflow such as job creation → invoice generation or time entry → payroll summary.
- Ensure API and UI behave consistently for that flow.

### P3 — Quality and maintainability
- Add a small test suite for auth and one critical router/page.
- Add clearer loading, empty, and error states across the admin dashboard.
- Standardize API error handling and user-facing feedback.

## Suggested order of execution
1. Employee clock and time tracking UX
2. Payroll and reporting clarity
3. Basic tests and UX polish
4. Deployment readiness and observability
