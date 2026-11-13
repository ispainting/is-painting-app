"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { BudgetActualBar } from "@/components/jobs/BudgetActualBar";

export function DashboardBudgetTracking() {
  const [selectedJobId, setSelectedJobId] = useState("");
  const query = api.jobs.budgetTracking.useQuery(
    { jobId: selectedJobId ? Number(selectedJobId) : undefined },
    { refetchInterval: 30_000 },
  );
  const rows = query.data?.jobs ?? [];
  const budget = rows.reduce(
    (total, row) => ({
      labor: total.labor + row.estimated.laborCost,
      materials: total.materials + row.estimated.materialsCost,
      subcontractors: total.subcontractors + row.estimated.subcontractorCost,
    }),
    { labor: 0, materials: 0, subcontractors: 0 },
  );
  const actual = rows.reduce(
    (total, row) => ({
      labor: total.labor + row.tracking.laborCost,
      materials: total.materials + row.tracking.materialsAndExpensesCost,
      subcontractors: total.subcontractors + row.tracking.subcontractorCost,
    }),
    { labor: 0, materials: 0, subcontractors: 0 },
  );
  const isSubcontractorBudgetPending = rows.some((row) => row.job.subcontractorBudgetPending);
  const totalBudget = budget.labor + budget.materials + budget.subcontractors;
  const totalActual = actual.labor + actual.materials + actual.subcontractors;
  const selectedJob = query.data?.jobOptions.find((job) => String(job.id) === selectedJobId);

  return (
    <section className="card mb-4 p-5" aria-label="Dashboard job budget tracking">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Job budget vs. actual cost</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedJob ? `${selectedJob.name} · ${selectedJob.status.replaceAll("_", " ")}` : "All active jobs"}
            {" · "}Live refresh every 30 seconds
          </p>
        </div>
        <label className="min-w-64 text-sm font-medium text-slate-700">
          Select a job
          <select
            className="input mt-1"
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
          >
            <option value="">All active jobs</option>
            {query.data?.jobOptions.map((job) => (
              <option key={job.id} value={job.id}>{job.name} · {job.status.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Under 75%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />75–89%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" />90–99%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />At or over budget</span>
      </div>

      {query.error ? <p role="alert" className="mt-4 text-sm text-red-700">{query.error.message}</p> : null}
      {query.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading job budgets…</p> : null}
      {!query.isLoading && !query.error && rows.length === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          {selectedJobId ? "No budget tracking data is available for this job." : "There are no active jobs to track right now."}
        </p>
      ) : null}
      {!query.isLoading && !query.error && rows.length > 0 ? (
        <>
          <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
            <BudgetActualBar label="Total tracked cost" actual={totalActual} budget={totalBudget} budgetPending={isSubcontractorBudgetPending} />
            <BudgetActualBar label="Labor" actual={actual.labor} budget={budget.labor} />
            <BudgetActualBar label="Materials & expenses" actual={actual.materials} budget={budget.materials} />
            <BudgetActualBar label="Subcontractors" actual={actual.subcontractors} budget={budget.subcontractors} budgetPending={isSubcontractorBudgetPending} />
          </div>
          {isSubcontractorBudgetPending ? <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">The total budget comparison is partial until every selected job has a subcontractor budget.</p> : null}
          {selectedJob ? <Link href={`/jobs/${selectedJob.id}?tab=tracking`} className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">Open this job’s Tracking tab</Link> : <p className="mt-4 text-xs text-slate-500">{rows.length} active job{rows.length === 1 ? "" : "s"} included.</p>}
        </>
      ) : null}
    </section>
  );
}

