"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { api } from "@/trpc/react";
import { BudgetActualBar } from "@/components/jobs/BudgetActualBar";

export function DashboardBudgetTracking() {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [showJobResults, setShowJobResults] = useState(false);
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
  const normalizedSearch = jobSearch.trim().toLocaleLowerCase();
  const matchingJobs = normalizedSearch.length >= 2
    ? (query.data?.jobOptions ?? []).filter((job) =>
        job.name.toLocaleLowerCase().includes(normalizedSearch) ||
        job.customer.name.toLocaleLowerCase().includes(normalizedSearch)
      ).slice(0, 8)
    : [];

  function chooseJob(job: NonNullable<typeof query.data>['jobOptions'][number]) {
    setSelectedJobId(String(job.id));
    setJobSearch(`${job.name} — ${job.customer.name}`);
    setShowJobResults(false);
  }

  function showAllActiveJobs() {
    setSelectedJobId("");
    setJobSearch("");
    setShowJobResults(false);
  }

  return (
    <section className="card mb-4 p-5" aria-label="Dashboard job budget tracking">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Job budget vs. actual cost</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedJob ? `${selectedJob.name} · ${selectedJob.customer.name} · ${selectedJob.status.replaceAll("_", " ")}` : "All active jobs"}
            {" · "}Live refresh every 30 seconds
          </p>
        </div>
        <div className="relative w-full max-w-xl">
          <label htmlFor="dashboard-job-search" className="text-sm font-medium text-slate-700">Search by client or project name</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="dashboard-job-search"
              type="search"
              className="input pl-9 pr-24"
              placeholder="Type a client or project name"
              value={jobSearch}
              onFocus={() => {
                if (selectedJobId) {
                  setSelectedJobId("");
                  setJobSearch("");
                }
                setShowJobResults(true);
              }}
              onBlur={() => window.setTimeout(() => setShowJobResults(false), 120)}
              onChange={(event) => {
                setJobSearch(event.target.value);
                setSelectedJobId("");
                setShowJobResults(true);
              }}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-blue-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={showAllActiveJobs}
            >
              All active
            </button>
          </div>
          {showJobResults && normalizedSearch.length >= 2 ? (
            <div role="listbox" aria-label="Matching jobs" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {matchingJobs.length ? matchingJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  role="option"
                  aria-selected={String(job.id) === selectedJobId}
                  className="block w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseJob(job)}
                >
                  <span className="block text-sm font-medium text-slate-900">{job.name}</span>
                  <span className="block text-xs text-slate-500">{job.customer.name} · {job.status.replaceAll("_", " ")}</span>
                </button>
              )) : <p className="px-3 py-3 text-sm text-slate-500">No jobs match that client or project name.</p>}
            </div>
          ) : null}
        </div>
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

