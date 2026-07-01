import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { customersRouter } from "./routers/customers";
import { jobsRouter } from "./routers/jobs";
import { opportunitiesRouter } from "./routers/opportunities";
import { proposalsRouter } from "./routers/proposals";
import { proposalExamplesRouter } from "./routers/proposalExamples";
import { timeRouter } from "./routers/time";
import { inventoryRouter } from "./routers/inventory";
import { expensesRouter } from "./routers/expenses";
import { invoicesRouter } from "./routers/invoices";
import { paymentsRouter } from "./routers/payments";
import { automationsRouter } from "./routers/automations";
import { employeesRouter } from "./routers/employees";
import { reportsRouter } from "./routers/reports";
import { configRouter } from "./routers/config";
import { reviewsRouter } from "./routers/reviews";

export const appRouter = router({
  auth: authRouter,
  customers: customersRouter,
  jobs: jobsRouter,
  opportunities: opportunitiesRouter,
  proposals: proposalsRouter,
  proposalExamples: proposalExamplesRouter,
  time: timeRouter,
  inventory: inventoryRouter,
  expenses: expensesRouter,
  invoices: invoicesRouter,
  payments: paymentsRouter,
  automations: automationsRouter,
  employees: employeesRouter,
  reports: reportsRouter,
  config: configRouter,
  reviews: reviewsRouter,
});

export type AppRouter = typeof appRouter;
