# I.S Painting — Deploy to a Live URL

Fastest path from this folder to a working `https://your-app.vercel.app`.
Total time: ~10 minutes if everything goes well.

---

## 0. What you'll have at the end

- A live URL (e.g. `https://is-painting.vercel.app`) you can open from any browser
- A real Postgres database on Neon (free tier)
- An admin login: `admin@ispainting.com / admin123`
- An employee login: `painter@ispainting.com / painter123`
- All MVP features working: customers, jobs (with auto-priced estimates), opportunities pipeline, time clock with GPS, inventory, expenses, invoices, automation templates, public review pages, settings

What WON'T work without extra setup (all optional):
- SMS via Twilio (needs `TWILIO_*` env vars)
- Email via SMTP (needs `SMTP_*` env vars)
- Receipt OCR / AI extraction (not wired in MVP)
- Cloudflare R2 file uploads (needs `R2_*` env vars)
- Google Maps geofencing display (needs `NEXT_PUBLIC_GOOGLE_MAPS_KEY`)

These features will simply be inert (no error) until you fill in the env vars.

---

## 1. Project file structure

```
is-painting/
├─ .env.example
├─ .gitignore
├─ DEPLOYMENT.md            ← this file
├─ README.md
├─ next.config.mjs
├─ package.json
├─ postcss.config.js
├─ tailwind.config.ts
├─ tsconfig.json
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
└─ src/
   ├─ middleware.ts
   ├─ app/
   │  ├─ globals.css
   │  ├─ layout.tsx
   │  ├─ page.tsx                          (root redirect)
   │  ├─ api/trpc/[trpc]/route.ts          (tRPC handler)
   │  ├─ (auth)/
   │  │  ├─ layout.tsx
   │  │  ├─ login/page.tsx
   │  │  └─ review/[token]/page.tsx        (public review)
   │  ├─ (admin)/                          (sidebar layout, admin only)
   │  │  ├─ layout.tsx
   │  │  ├─ dashboard/page.tsx
   │  │  ├─ jobs/page.tsx
   │  │  ├─ jobs/[id]/page.tsx
   │  │  ├─ customers/page.tsx
   │  │  ├─ opportunities/page.tsx         (kanban)
   │  │  ├─ time/page.tsx
   │  │  ├─ inventory/page.tsx
   │  │  ├─ expenses/page.tsx
   │  │  ├─ invoices/page.tsx
   │  │  ├─ automations/page.tsx
   │  │  ├─ employees/page.tsx
   │  │  ├─ reports/page.tsx
   │  │  └─ settings/page.tsx
   │  └─ (employee)/
   │     ├─ layout.tsx
   │     └─ clock/page.tsx                 (mobile clock-in/out + GPS)
   ├─ components/layout/
   │  ├─ Sidebar.tsx
   │  └─ PageHeader.tsx
   ├─ lib/
   │  ├─ auth.ts          (bcrypt + JWT cookie session)
   │  ├─ db.ts            (Prisma singleton)
   │  └─ utils.ts         (formatters + pricing engine)
   ├─ server/api/
   │  ├─ trpc.ts          (context, public/protected/admin procedures)
   │  ├─ root.ts          (router merge)
   │  └─ routers/
   │     ├─ auth.ts
   │     ├─ customers.ts
   │     ├─ jobs.ts
   │     ├─ opportunities.ts
   │     ├─ time.ts
   │     ├─ inventory.ts
   │     ├─ expenses.ts
   │     ├─ invoices.ts
   │     ├─ payments.ts
   │     ├─ automations.ts
   │     ├─ employees.ts
   │     ├─ reports.ts
   │     ├─ config.ts
   │     └─ reviews.ts
   └─ trpc/react.tsx       (tRPC + React Query provider)
```

---

## 2. Push to GitHub

You have two options. Pick whichever you prefer.

### Option A — GitHub web UI (drag & drop, no terminal)
1. Open https://github.com/new
2. Repository name: `is-painting`. Visibility: **Private**. Click **Create repository**.
3. On the new empty repo page, click **uploading an existing file**.
4. Drag the entire `is-painting` folder's **contents** (not the folder itself) onto the upload area. Make sure `.env` is NOT in the upload — only `.env.example` should go up.
5. Commit message: `initial import`. Click **Commit changes**.

### Option B — Terminal (gh CLI or git)
```bash
cd is-painting
git init
git add .
git commit -m "initial import"

# create the repo on GitHub (uses the gh CLI)
gh repo create is-painting --private --source=. --remote=origin --push
# OR if you don't have gh:
# Create the empty repo on github.com, then:
git remote add origin git@github.com:<you>/is-painting.git
git branch -M main
git push -u origin main
```

---

## 3. Create the Neon Postgres database

1. Go to https://console.neon.tech and sign up (free tier is fine).
2. Click **Create Project**. Region: pick the one closest to where Vercel will deploy (US East works for most). Postgres version: **16**.
3. After it's created, you'll land on the project's **Dashboard**.
4. Click **Connection Details** (top right).
5. **Important:** toggle **"Pooled connection"** ON, then copy the connection string. It will look like:
   ```
   postgresql://USER:PASSWORD@ep-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   Save this as `DATABASE_URL`.
6. Toggle **"Pooled connection"** OFF, copy that connection string too. It will look the same but without `-pooler` in the host:
   ```
   postgresql://USER:PASSWORD@ep-xxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   Save this as `DIRECT_URL`. Prisma uses this for migrations (PgBouncer can't run migrations).

That's all you need from Neon. The schema and seed will be created automatically below.

---

## 4. Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **Import** next to your `is-painting` GitHub repo. (You may need to authorize Vercel to access your GitHub.)
3. Framework Preset: **Next.js** (auto-detected).
4. Root Directory: leave as `./`.
5. Expand **Build & Output Settings** and set:
   - **Build Command:** `prisma migrate deploy && prisma db seed && next build`
   - Install Command, Output Directory: leave defaults.
6. Expand **Environment Variables** and add the values from section 5 below.
7. Click **Deploy**.

The build will:
- Install dependencies
- Generate the Prisma client (via `postinstall`)
- Run `prisma migrate deploy` — applies your migrations to Neon
- Run `prisma db seed` — creates the admin user, sample data, and automation templates
- Build Next.js

When it's green, click **Visit** to open your live URL.

> First deploy after adding new migrations: same command works. If you ever need to skip seeding on subsequent deploys, change the build command to just `prisma migrate deploy && next build`.

> Initial migration creation: the very first build won't find a migration to deploy because none exists yet. Two ways to handle this:
>
> **Easiest** — before deploying, run locally:
> ```bash
> cp .env.example .env
> # paste your DIRECT_URL into BOTH DATABASE_URL and DIRECT_URL in .env temporarily
> npm install
> npx prisma migrate dev --name init
> ```
> This creates `prisma/migrations/<timestamp>_init/`. Commit it and push. Then Vercel's `prisma migrate deploy` has something to apply.
>
> Keep production deploys on `prisma migrate deploy` to apply tracked, safe migrations.

---

## 5. Environment variables (exact values)

Add these in Vercel under **Project → Settings → Environment Variables** (or in the Deploy step). Apply each to all three environments (Production, Preview, Development) unless noted.

### Required

| Name | Value |
|---|---|
| `DATABASE_URL` | Your Neon **pooled** connection string from section 3 step 5 |
| `DIRECT_URL` | Your Neon **direct** (non-pooled) connection string from section 3 step 6 |
| `JWT_SECRET` | A long random string. Generate with `openssl rand -base64 48` or any password manager. **Do NOT reuse the placeholder.** |
| `JWT_EXPIRES_IN` | `7d` |
| `NEXT_PUBLIC_APP_URL` | After first deploy, set this to your live URL (e.g. `https://is-painting.vercel.app`). For the first deploy, leave blank or set to `http://localhost:3000` — it's only used as a fallback. |

### Optional (all features still load if these are blank)

| Name | What it enables |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS automation steps |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email automation steps |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Receipt + check photo uploads |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Map display + geofence visualization |

After your first successful deploy, update `NEXT_PUBLIC_APP_URL` to your real URL and redeploy (Vercel → Deployments → "..." → Redeploy).

---

## 6. What works once deployed

When the deploy turns green, open the URL. You'll see the login page.

- **Log in as admin** with `admin@ispainting.com / admin123`. You'll land on the dashboard with KPI cards.
- **Sidebar navigation** has 12 sections. Every one is wired to the database.
- **Customers** — add, search, soft-delete.
- **Jobs** — auto-numbered (`EST-0001`...). Estimate totals are computed on save using the formula `(materials + labor) * (1 + (wc + gl + overhead)/100) * (1 + markup/100) * (1 + tax/100)`. Status transitions are tracked (`sentAt`, `approvedAt` auto-stamped). Approving a job locks the budget and copies `totalEstimate` into `contractAmount`.
- **Opportunities** — kanban-style board across the 8 sales-pipeline stages. Drop-down stage updates persist immediately.
- **Time** — admins see all entries from the last 30 days and can approve them.
- **Inventory** — list with low-stock highlighting.
- **Expenses** — approve / reject pending submissions.
- **Invoices** — list with status, totals, and remaining balance.
- **Automations** — view all four templates (`follow_up`, `not_answered`, `review_request`, `form_submit`) with their steps. Toggle each on/off.
- **Employees** — add admins or employees with bcrypt-hashed passwords.
- **Reports** — KPI summary.
- **Settings** — company info + default WC/GL/overhead/markup/tax percentages, persisted to the singleton `Config` row.
- **Public review** — `https://your-app.vercel.app/review/<token>` works without auth. Ratings ≥ 4 redirect to your Google review URL (set in Settings).
- **Employee mobile clock** — log in as `painter@ispainting.com / painter123` to see the mobile clock-in/out screen with browser geolocation. Employees only see jobs they're assigned to.

Auth is JWT in an httpOnly cookie. Middleware guards every route except `/login`, `/review/*`, and `/api/trpc`.
Role enforcement: `protectedProcedure` requires login; `adminProcedure` requires `role: 'admin'`.

---

## 7. Troubleshooting

- **"Can't reach database server"** during build: double-check `DIRECT_URL`. It must be the non-pooled host (no `-pooler`).
- **"P3014: Prisma Migrate could not create the shadow database"**: Neon's free tier doesn't allow shadow DBs. Workaround: use `prisma migrate deploy` (which doesn't need one) — that's what the deploy command does. For local development, use a separate dev database or run `prisma db push` instead of `migrate dev`.
- **Build runs `prisma migrate deploy` and says `No pending migrations to apply`** but the DB is empty: you forgot to commit `prisma/migrations/` — run the local `prisma migrate dev --name init` step from section 4.
- **"Invalid `prisma.user.findUnique()`"** on first login: seed didn't run. Trigger a redeploy, or run `npx prisma db seed` locally pointing at your Neon DB.
- **Cookies not persisting on iOS Safari**: confirm `NEXT_PUBLIC_APP_URL` is `https://...`, not `http://`.

---

## 8. After it's live

To rotate the admin password: log in, go to **Employees**, edit yourself, and use **Reset password** (or run a one-off script via `npx prisma studio`).

To add a custom domain in Vercel: Project → Settings → Domains. Then update `NEXT_PUBLIC_APP_URL` and redeploy.

To branch the database for a preview environment: Neon → Branches → Create branch. Point Vercel preview env vars at the branch's connection string.
