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
