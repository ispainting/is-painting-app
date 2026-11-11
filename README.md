# I.S Painting Business Manager

Next.js 14 (App Router) + Prisma + PostgreSQL + tRPC + Tailwind.
CRM, Jobs, Time Tracking, Invoices, Payments, Inventory, Expenses, Automations.

## Quick start

```bash
cp .env.example .env       # then edit DATABASE_URL & JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open http://localhost:3000 — log in with `admin@ispainting.com / admin123`.

## Stack
- Next.js 14 (App Router, RSC)
- Prisma 5 + PostgreSQL
- tRPC v11 + TanStack Query
- Tailwind CSS
- bcryptjs + JWT (httpOnly cookie auth)
- Zod for validation

## Internal PDF exports

Employees, Customers, Jobs, Opportunities, Time / Payroll, Material Catalog, and
Reports share an **Export PDF** download. Exports are generated in the browser
from explicit field allowlists; generation does not create or update records.
The shared document includes company branding, America/New_York timestamps,
filter/date summaries, totals, repeated table headers, and confidential footers.

- Export scope is the currently loaded filtered result set, not checked rows.
  Employee exports cover the visible page; Jobs, Customers, and Time retain
  their existing 200 / 500 / 1,000 record query limits, stated in the PDF.
- Employee exports have a separate payroll date range and read the existing
  admin-only Time query (up to 1,000 entries per visible employee).
- Time exports and the on-screen payroll preview share the same weekly overtime,
  special/island, and once-per-employee/job/day travel calculation. Stored paid
  hours are not recalculated by PDF generation.
- Completion reporting uses `completedAt ?? endDate`, never creation/edit
  timestamps; missing completion dates have a separate count/value.
- Reports export the selected report response, including tables behind charts,
  labeled trailing-window series, and all-time missing-date totals. Google
  Search and Google Ads remain separate.
- No employee login phone, password/PIN, session data, receipt path, or internal
  link is included. Standard PDF fonts support Western European names and
  punctuation; unsupported characters produce a visible export error rather
  than silently replacing names.
- Downloads use a temporary PDF Blob URL with delayed cleanup for mobile
  viewers. Browser download/viewer behavior depends on the device.
