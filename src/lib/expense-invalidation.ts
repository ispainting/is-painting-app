/**
 * Central place for expense-mutation cache invalidation so every screen
 * refreshes the same queries after create/approve/reject/delete.
 */
type ExpenseQueryUtils = {
  expenses: {
    list: { invalidate: () => unknown };
    stats: { invalidate: () => unknown };
    meta: { invalidate: () => unknown };
  };
  jobs: {
    byId: { invalidate: (input?: { id: number }) => unknown };
    list: { invalidate: () => unknown };
  };
  business: { analytics: { invalidate: () => unknown } };
  reports: { dashboard: { invalidate: () => unknown } };
};

export function invalidateExpenseQueries(utils: ExpenseQueryUtils, jobId?: number | null) {
  void utils.expenses.list.invalidate();
  void utils.expenses.stats.invalidate();
  void utils.expenses.meta.invalidate();
  if (jobId != null) {
    void utils.jobs.byId.invalidate({ id: jobId });
  } else {
    void utils.jobs.byId.invalidate();
  }
  void utils.jobs.list.invalidate();
  void utils.business.analytics.invalidate();
  void utils.reports.dashboard.invalidate();
}
