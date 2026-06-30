"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "builder", label: "Builder" },
  { id: "options", label: "Options" },
  { id: "attachments", label: "Attachments" },
  { id: "pdf-send", label: "PDF" },
  { id: "email", label: "Email" },
  { id: "approval", label: "Approval" },
] as const;

type ProposalTab = (typeof TABS)[number]["id"];
const PROPOSAL_STATUSES = ["draft", "ready", "sent", "viewed", "approved", "declined", "follow_up", "converted"] as const;

type OptionDraft = {
  title: string;
  description: string;
  scope: string;
  price: string;
  isVisible: boolean;
  sortOrder: number;
};

type AttachmentDraft = {
  category: string;
  fileName: string;
  fileUrl: string;
  notes: string;
  sortOrder: number;
};

export default function ProposalDetailPage() {
  const utils = api.useUtils();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: proposal, isLoading } = api.proposals.byId.useQuery({ id });
  const [tab, setTab] = useState<ProposalTab>("overview");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery({ search: customerSearch.trim() || undefined }, { enabled: !!proposal });
  const [roughNotes, setRoughNotes] = useState("");
  const [form, setForm] = useState({
    customerId: 0,
    projectName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    status: "draft" as (typeof PROPOSAL_STATUSES)[number],
    scopeOfWork: "",
    includedWork: "",
    exclusions: "",
    importantNotes: "",
    recommendations: "",
    proposalBody: "",
    aiAssistantNotes: "",
    notes: "",
    emailBody: "",
    referencesText: "",
    termsAndConditions: "",
    paymentSchedule: "",
    materialsBudget: 0,
    laborBudget: 0,
    subcontractorBudget: 0,
    totalAmount: 0,
    expectedStartDate: "",
    expectedEndDate: "",
    options: [] as OptionDraft[],
    attachments: [] as AttachmentDraft[],
  });

  const editorRef = useRef<HTMLDivElement>(null);

  const update = api.proposals.update.useMutation({
    onSuccess: () => {
      toast.success("Proposal saved");
      utils.proposals.byId.invalidate({ id });
      utils.proposals.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateProposalDraft = api.proposals.generateProposalDraft.useMutation({
    onSuccess: (data) => {
      setForm((f) => ({
        ...f,
        scopeOfWork: data.scopeOfWork,
        includedWork: data.includedWork,
        exclusions: data.exclusions,
        importantNotes: data.importantNotes,
        recommendations: data.recommendations,
        referencesText: data.referencesText,
        proposalBody: data.proposalBody,
      }));
      toast.success("AI proposal draft generated");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateEmailDraft = api.proposals.generateEmailDraft.useMutation({
    onSuccess: (data) => {
      setForm((f) => ({ ...f, emailBody: data.body }));
      toast.success("AI email draft generated");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!proposal) return;
    setCustomerSearch(proposal.customer.name);
    setForm({
      customerId: proposal.customerId,
      projectName: proposal.projectName,
      address: proposal.address || "",
      city: proposal.city || "",
      state: proposal.state || "",
      zipCode: proposal.zipCode || "",
      status: proposal.status as (typeof PROPOSAL_STATUSES)[number],
      scopeOfWork: proposal.scopeOfWork || "",
      includedWork: proposal.includedWork || "",
      exclusions: proposal.exclusions || "",
      importantNotes: proposal.importantNotes || "",
      recommendations: proposal.recommendations || "",
      proposalBody: proposal.proposalBody || "",
      aiAssistantNotes: proposal.aiAssistantNotes || "",
      notes: proposal.notes || "",
      emailBody: proposal.emailBody || "",
      referencesText: proposal.referencesText || "",
      termsAndConditions: proposal.termsAndConditions || "",
      paymentSchedule: proposal.paymentSchedule || "",
      materialsBudget: Number(proposal.materialsBudget),
      laborBudget: Number(proposal.laborBudget),
      subcontractorBudget: Number(proposal.subcontractorBudget),
      totalAmount: Number(proposal.totalAmount),
      expectedStartDate: proposal.expectedStartDate ? new Date(proposal.expectedStartDate).toISOString().slice(0, 10) : "",
      expectedEndDate: proposal.expectedEndDate ? new Date(proposal.expectedEndDate).toISOString().slice(0, 10) : "",
      options: proposal.options.map((o) => ({
        title: o.title,
        description: o.description || "",
        scope: o.scope || "",
        price: o.price == null ? "" : String(o.price),
        isVisible: o.isVisible,
        sortOrder: o.sortOrder,
      })),
      attachments: proposal.attachments.map((a) => ({
        category: a.category,
        fileName: a.fileName,
        fileUrl: a.fileUrl || "",
        notes: a.notes || "",
        sortOrder: a.sortOrder,
      })),
    });
  }, [proposal]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== form.proposalBody) {
      editorRef.current.innerHTML = form.proposalBody;
    }
  }, [form.proposalBody]);

  const isReadOnly = form.status === "converted";
  const totalOptionsAmount = useMemo(
    () =>
      form.options.reduce((sum, option) => {
        const parsed = parseFloat(option.price);
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }, 0),
    [form.options]
  );

  const onSave = () => {
    update.mutate({
      id,
      data: {
        customerId: form.customerId,
        projectName: form.projectName,
        address: form.address,
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        status: form.status,
        scopeOfWork: form.scopeOfWork,
        includedWork: form.includedWork,
        exclusions: form.exclusions,
        importantNotes: form.importantNotes,
        recommendations: form.recommendations,
        proposalBody: form.proposalBody,
        aiAssistantNotes: form.aiAssistantNotes,
        notes: form.notes,
        emailBody: form.emailBody,
        referencesText: form.referencesText,
        termsAndConditions: form.termsAndConditions,
        paymentSchedule: form.paymentSchedule,
        materialsBudget: form.materialsBudget,
        laborBudget: form.laborBudget,
        subcontractorBudget: form.subcontractorBudget,
        totalAmount: form.totalAmount,
        expectedStartDate: form.expectedStartDate ? new Date(form.expectedStartDate) : null,
        expectedEndDate: form.expectedEndDate ? new Date(form.expectedEndDate) : null,
        options: form.options.map((o, index) => ({
          title: o.title,
          description: o.description,
          scope: o.scope,
          price: o.price.trim() === "" ? null : parseFloat(o.price),
          isVisible: o.isVisible,
          sortOrder: o.sortOrder || index,
        })),
        attachments: form.attachments.map((a, index) => ({
          category: a.category,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          notes: a.notes,
          sortOrder: a.sortOrder || index,
        })),
      },
    });
  };

  const selectCustomer = (customer: {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  }) => {
    setForm((f) => ({
      ...f,
      customerId: customer.id,
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zipCode: customer.zipCode || "",
    }));
    setCustomerSearch(customer.name);
    setShowCustomerResults(false);
  };

  const execCommand = (command: string, value?: string) => {
    if (isReadOnly) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setForm((f) => ({ ...f, proposalBody: editorRef.current?.innerHTML || "" }));
  };

  if (isLoading || !proposal) return <div className="text-slate-500">Loading…</div>;

  return (
    <>
      <PageHeader
        title={proposal.projectName}
        description={`${proposal.proposalNumber} · ${proposal.customer.name}`}
        actions={
          <div className="flex gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => toast.info("Proposal conversion architecture is ready. Job conversion implementation is intentionally deferred.")}
            >
              Convert to Job
            </button>
            <button className="btn btn-primary" disabled={update.isPending || isReadOnly} onClick={onSave}>
              {update.isPending ? "Saving..." : "Save Proposal"}
            </button>
          </div>
        }
      />

      {isReadOnly && (
        <div className="card p-4 mb-4 border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          This proposal is converted and now read-only. Operational updates should happen in the Job workspace.
        </div>
      )}

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
          <h2 className="text-base font-semibold mb-3">Proposal Workspace Overview</h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm mb-5">
            <Stat label="Proposal #" value={proposal.proposalNumber} />
            <Stat label="Created" value={formatDateTime(proposal.createdAt)} />
            <Stat label="Last Updated" value={formatDateTime(proposal.updatedAt)} />
            <Stat label="Options" value={String(form.options.length)} />
            <Stat label="Attachments" value={String(form.attachments.length)} />
            <Stat label="Options Pricing" value={formatCurrency(totalOptionsAmount)} />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="label">Customer</label>
              <div className="relative">
                <input
                  className="input"
                  value={customerSearch}
                  onFocus={() => setShowCustomerResults(true)}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerResults(true);
                  }}
                  disabled={isReadOnly}
                  placeholder="Search customer"
                />
                {showCustomerResults && customerSearch.trim().length > 0 && !isReadOnly && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {customers.isLoading ? (
                      <div className="px-3 py-2 text-sm text-slate-500">Searching...</div>
                    ) : customers.data && customers.data.length > 0 ? (
                      customers.data.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                          onClick={() => selectCustomer(c)}
                        >
                          <div className="text-sm font-medium text-slate-900">{c.name}</div>
                          <div className="text-xs text-slate-600">{c.address || "No address on file"}</div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500">No matching customers.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as (typeof PROPOSAL_STATUSES)[number] }))}
                disabled={isReadOnly}
              >
                {PROPOSAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <FieldText label="Project Name" value={form.projectName} onChange={(v) => setForm((f) => ({ ...f, projectName: v }))} disabled={isReadOnly} className="md:col-span-3" />
            <FieldText label="Street" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} disabled={isReadOnly} className="md:col-span-3" />
            <FieldText label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={isReadOnly} />
            <FieldText label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} disabled={isReadOnly} />
            <FieldText label="Zip" value={form.zipCode} onChange={(v) => setForm((f) => ({ ...f, zipCode: v }))} disabled={isReadOnly} />

            <FieldNumber label="Materials Budget" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} disabled={isReadOnly} />
            <FieldNumber label="Labor Budget" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} disabled={isReadOnly} />
            <FieldNumber label="Subcontractor Budget" value={form.subcontractorBudget} onChange={(v) => setForm((f) => ({ ...f, subcontractorBudget: v }))} disabled={isReadOnly} />
            <FieldNumber label="Total Amount" value={form.totalAmount} onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))} disabled={isReadOnly} />
            <FieldDate label="Expected Start" value={form.expectedStartDate} onChange={(v) => setForm((f) => ({ ...f, expectedStartDate: v }))} disabled={isReadOnly} />
            <FieldDate label="Expected End" value={form.expectedEndDate} onChange={(v) => setForm((f) => ({ ...f, expectedEndDate: v }))} disabled={isReadOnly} />
          </div>
        </div>
      )}

      {tab === "builder" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">AI Proposal Assistant</h2>
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            <div className="md:col-span-2">
              <label className="label">Large Notes Input</label>
              <textarea
                className="input min-h-28"
                value={roughNotes}
                onChange={(e) => setRoughNotes(e.target.value)}
                disabled={isReadOnly}
                placeholder="Example: 12x12 mahogany deck / light sanding option 1300 / full sanding option 1600"
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                className="btn btn-secondary"
                disabled={isReadOnly || generateProposalDraft.isPending || roughNotes.trim().length === 0}
                onClick={() =>
                  generateProposalDraft.mutate({
                    roughNotes,
                    customerName: customerSearch,
                    projectName: form.projectName,
                    options: form.options.map((o) => ({
                      title: o.title,
                      price: o.price.trim() === "" ? null : parseFloat(o.price),
                    })),
                  })
                }
              >
                {generateProposalDraft.isPending ? "Generating..." : "Generate Proposal"}
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-6">
            <FieldArea label="Scope of Work" value={form.scopeOfWork} onChange={(v) => setForm((f) => ({ ...f, scopeOfWork: v }))} disabled={isReadOnly} />
            <FieldArea label="Included Work" value={form.includedWork} onChange={(v) => setForm((f) => ({ ...f, includedWork: v }))} disabled={isReadOnly} />
            <FieldArea label="Exclusions" value={form.exclusions} onChange={(v) => setForm((f) => ({ ...f, exclusions: v }))} disabled={isReadOnly} />
            <FieldArea label="Important Notes" value={form.importantNotes} onChange={(v) => setForm((f) => ({ ...f, importantNotes: v }))} disabled={isReadOnly} />
            <FieldArea label="Recommendations" value={form.recommendations} onChange={(v) => setForm((f) => ({ ...f, recommendations: v }))} disabled={isReadOnly} />
            <FieldArea label="References" value={form.referencesText} onChange={(v) => setForm((f) => ({ ...f, referencesText: v }))} disabled={isReadOnly} />
            <FieldArea label="Payment Schedule" value={form.paymentSchedule} onChange={(v) => setForm((f) => ({ ...f, paymentSchedule: v }))} disabled={isReadOnly} />
            <FieldArea label="Terms" value={form.termsAndConditions} onChange={(v) => setForm((f) => ({ ...f, termsAndConditions: v }))} disabled={isReadOnly} />
            <FieldArea label="Proposal Notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} disabled={isReadOnly} />
            <FieldArea label="AI Assistant Notes" value={form.aiAssistantNotes} onChange={(v) => setForm((f) => ({ ...f, aiAssistantNotes: v }))} disabled={isReadOnly} />
          </div>

          <h3 className="text-sm font-semibold mb-2">Proposal Designer</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" className="btn btn-secondary" onClick={() => execCommand("bold")} disabled={isReadOnly}>Bold</button>
            <button type="button" className="btn btn-secondary" onClick={() => execCommand("insertUnorderedList")} disabled={isReadOnly}>List</button>
            <button type="button" className="btn btn-secondary" onClick={() => execCommand("formatBlock", "<h2>")} disabled={isReadOnly}>Header</button>
            <button type="button" className="btn btn-secondary" onClick={() => execCommand("insertParagraph")} disabled={isReadOnly}>Paragraph</button>
          </div>
          <div
            ref={editorRef}
            contentEditable={!isReadOnly}
            suppressContentEditableWarning
            className="min-h-72 rounded-md border border-slate-200 p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-brand-500"
            onInput={() => setForm((f) => ({ ...f, proposalBody: editorRef.current?.innerHTML || "" }))}
          />
        </div>
      )}

      {tab === "options" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Proposal Options</h2>
            <button
              className="btn btn-secondary"
              disabled={isReadOnly}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  options: [
                    ...f.options,
                    { title: "", description: "", scope: "", price: "", isVisible: true, sortOrder: f.options.length },
                  ],
                }))
              }
            >
              Add Option
            </button>
          </div>
          <div className="space-y-4">
            {form.options.length === 0 ? (
              <div className="text-sm text-slate-500">No options yet. Add unlimited options for this proposal.</div>
            ) : (
              form.options.map((option, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-3 grid md:grid-cols-2 gap-3">
                  <FieldText
                    label="Title"
                    value={option.title}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((current, i) => (i === index ? { ...current, title: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldText
                    label="Price"
                    value={option.price}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((current, i) => (i === index ? { ...current, price: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldArea
                    label="Description"
                    value={option.description}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((current, i) => (i === index ? { ...current, description: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldArea
                    label="Scope"
                    value={option.scope}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((current, i) => (i === index ? { ...current, scope: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />

                  <div>
                    <label className="label">Visible</label>
                    <input
                      type="checkbox"
                      checked={option.isVisible}
                      disabled={isReadOnly}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          options: f.options.map((current, i) => (i === index ? { ...current, isVisible: e.target.checked } : current)),
                        }))
                      }
                    />
                  </div>
                  <FieldNumber
                    label="Sort Order"
                    value={option.sortOrder}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((current, i) => (i === index ? { ...current, sortOrder: Math.trunc(v) } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      className="btn btn-secondary"
                      disabled={isReadOnly}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          options: f.options.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove Option
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "attachments" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Attachments</h2>
            <button
              className="btn btn-secondary"
              disabled={isReadOnly}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  attachments: [
                    ...f.attachments,
                    { category: "other", fileName: "", fileUrl: "", notes: "", sortOrder: f.attachments.length },
                  ],
                }))
              }
            >
              Add Attachment
            </button>
          </div>
          <div className="space-y-4">
            {form.attachments.length === 0 ? (
              <div className="text-sm text-slate-500">No attachments listed yet.</div>
            ) : (
              form.attachments.map((attachment, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-3 grid md:grid-cols-2 gap-3">
                  <FieldText
                    label="Category"
                    value={attachment.category}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        attachments: f.attachments.map((current, i) => (i === index ? { ...current, category: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldText
                    label="File Name"
                    value={attachment.fileName}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        attachments: f.attachments.map((current, i) => (i === index ? { ...current, fileName: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldText
                    label="File URL"
                    value={attachment.fileUrl}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        attachments: f.attachments.map((current, i) => (i === index ? { ...current, fileUrl: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldNumber
                    label="Sort Order"
                    value={attachment.sortOrder}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        attachments: f.attachments.map((current, i) => (i === index ? { ...current, sortOrder: Math.trunc(v) } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldArea
                    label="Notes"
                    value={attachment.notes}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        attachments: f.attachments.map((current, i) => (i === index ? { ...current, notes: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                    className="md:col-span-2"
                  />
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      className="btn btn-secondary"
                      disabled={isReadOnly}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          attachments: f.attachments.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove Attachment
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "pdf-send" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">PDF Package</h2>
          <p className="text-sm text-slate-600 mb-4">
            Architecture is ready for branded PDF export with logo, customer details, scope, options, pricing,
            terms, attachment list, references, and signature section.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <Stat label="Customer" value={customerSearch || "—"} />
            <Stat label="Address" value={[form.address, form.city, form.state, form.zipCode].filter(Boolean).join(", ") || "—"} />
            <Stat label="Proposal #" value={proposal.proposalNumber} />
            <Stat label="Options" value={String(form.options.length)} />
            <Stat label="Attachments" value={String(form.attachments.length)} />
            <Stat label="Pricing" value={formatCurrency(form.totalAmount)} />
          </div>
          <div className="mt-4">
            <button className="btn btn-secondary" onClick={() => toast.info("PDF generation will be added on top of this data architecture.")}>Generate PDF</button>
          </div>
        </div>
      )}

      {tab === "email" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Email Draft</h2>
            <button
              className="btn btn-secondary"
              disabled={isReadOnly || generateEmailDraft.isPending}
              onClick={() =>
                generateEmailDraft.mutate({
                  customerName: customerSearch,
                  projectName: form.projectName,
                  includeCoi: true,
                  includeBooklet: true,
                  includeReferences: true,
                })
              }
            >
              {generateEmailDraft.isPending ? "Generating..." : "Generate Email"}
            </button>
          </div>
          <textarea
            className="input min-h-72"
            value={form.emailBody}
            onChange={(e) => setForm((f) => ({ ...f, emailBody: e.target.value }))}
            disabled={isReadOnly}
            placeholder="AI generated email will appear here and remain fully editable."
          />
        </div>
      )}

      {tab === "approval" && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Status Timeline</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Stat label="Status" value={form.status} />
              <Stat label="Sent Date" value={proposal.sentAt ? formatDateTime(proposal.sentAt) : "—"} />
              <Stat label="Approved Date" value={proposal.approvedAt ? formatDateTime(proposal.approvedAt) : "—"} />
              <Stat label="Converted" value={form.status === "converted" ? "Yes" : "No"} />
            </div>
          </div>
          <ComingSoonCard title="Job Conversion" description="Conversion button is in place. Data model now contains required conversion payload fields." />
          <ComingSoonCard title="Audit" description="Proposal remains fully editable until status is converted." />
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

function FieldText({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step="0.01"
        className="input"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        disabled={disabled}
      />
    </div>
  );
}

function FieldDate({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <textarea className="input min-h-28" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}
