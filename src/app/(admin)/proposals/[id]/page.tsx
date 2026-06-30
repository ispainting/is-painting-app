"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "scope", label: "Scope" },
  { id: "budget", label: "Budget" },
  { id: "pdf-send", label: "PDF / Send" },
  { id: "approval", label: "Approval" },
] as const;

type ProposalTab = (typeof TABS)[number]["id"];

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: proposal, isLoading } = api.proposals.byId.useQuery({ id });
  const [tab, setTab] = useState<ProposalTab>("overview");

  if (isLoading || !proposal) return <div className="text-slate-500">Loading…</div>;

  return (
    <>
      <PageHeader
        title={proposal.projectName}
        description={`${proposal.proposalNumber} · ${proposal.customer.name}`}
      />

      <div className="card p-2 mb-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={[
                "px-3 py-2 rounded-md text-sm font-medium transition",
                tab === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Overview</h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <Stat label="Proposal #" value={proposal.proposalNumber} />
            <Stat label="Customer" value={proposal.customer.name} />
            <Stat label="Status" value={proposal.status} />
            <Stat label="Street" value={proposal.address || "—"} />
            <Stat label="City" value={proposal.city || "—"} />
            <Stat label="State" value={proposal.state || "—"} />
            <Stat label="Zip" value={proposal.zipCode || "—"} />
            <Stat label="Total Amount" value={formatCurrency(Number(proposal.totalAmount))} />
            <Stat label="Created" value={formatDateTime(proposal.createdAt)} />
          </div>
        </div>
      )}

      {tab === "scope" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-2">Scope of Work</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{proposal.scopeOfWork || "No scope added yet."}</p>
          <h3 className="text-sm font-semibold mt-5 mb-1">Notes</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{proposal.notes || "No notes yet."}</p>
        </div>
      )}

      {tab === "budget" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Budget</h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <Stat label="Materials Budget" value={formatCurrency(Number(proposal.materialsBudget))} />
            <Stat label="Labor Budget" value={formatCurrency(Number(proposal.laborBudget))} />
            <Stat label="Subcontractor Budget" value={formatCurrency(Number(proposal.subcontractorBudget))} />
            <Stat label="Total Amount" value={formatCurrency(Number(proposal.totalAmount))} />
          </div>
        </div>
      )}

      {tab === "pdf-send" && (
        <div className="grid md:grid-cols-2 gap-4">
          <ComingSoonCard title="Proposal PDF" description="PDF generation is coming soon." />
          <ComingSoonCard title="Send Proposal" description="Email/SMS sending workflow is coming soon." />
        </div>
      )}

      {tab === "approval" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Approval</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Stat label="Status" value={proposal.status} />
              <Stat label="Sent Date" value={proposal.sentAt ? formatDateTime(proposal.sentAt) : "—"} />
              <Stat label="Approved Date" value={proposal.approvedAt ? formatDateTime(proposal.approvedAt) : "—"} />
            </div>
          </div>
          <ComingSoonCard title="Convert to Job" description="Proposal-to-job conversion is coming soon." />
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-base font-medium mt-0.5">{value}</div>
    </div>
  );
}

function ComingSoonCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-500">Coming Soon</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
  );
}
