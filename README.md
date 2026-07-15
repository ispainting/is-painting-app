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

## Receipt AI extraction

Receipt extraction is backed by Manus API v2 and requires these server env vars:

- `MANUS_API_KEY`
- `MANUS_API_BASE_URL` (default: `https://api.manus.ai`)
- `MANUS_RECEIPT_TIMEOUT_MS` (default: `90000`)
- `MANUS_RECEIPT_POLL_INTERVAL_MS` (default: `1500`)

## Stack
- Next.js 14 (App Router, RSC)
- Prisma 5 + PostgreSQL
- tRPC v11 + TanStack Query
- Tailwind CSS
- bcryptjs + JWT (httpOnly cookie auth)
- Zod for validation
