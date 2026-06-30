"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "scope", label: "Scope" },
  { id: "pricing", label: "Pricing" },
  { id: "paint-colors", label: "Paint Colors" },
  { id: "attachments", label: "Attachments" },
  { id: "preview", label: "Preview" },
  { id: "approval", label: "Approval" },
  { id: "activity", label: "Activity" },
] as const;

type ProposalTab = (typeof TABS)[number]["id"];
const PROPOSAL_STATUSES = ["draft", "ready", "sent", "viewed", "approved", "declined", "follow_up", "converted"] as const;
const PROPOSAL_TYPES = ["residential", "commercial", "restoration", "maintenance", "new_construction", "custom"] as const;
const PROPOSAL_TEMPLATES = [
  "interior_painting",
  "exterior_painting",
  "cabinet_refinishing",
  "deck_restoration",
  "pergola_restoration",
  "trim_restoration",
  "wallpaper_removal",
  "drywall_repair",
  "commercial_painting",
  "new_construction",
  "property_maintenance",
] as const;

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

type PaintColorDraft = {
  area: string;
  colorName: string;
  brand: string;
  finish: string;
  notes: string;
  sortOrder: number;
};

function isMeaningfulRow(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

const TEMPLATE_PRESETS: Record<(typeof PROPOSAL_TEMPLATES)[number], {
  projectSummary: string;
  scopeOfWork: string;
  includedWork: string;
  exclusions: string;
  recommendations: string;
  importantNotes: string;
  referencesText: string;
  closingText: string;
}> = {
  interior_painting: {
    projectSummary: "Interior repaint focused on finish quality, cleanliness, and minimal disruption.",
    scopeOfWork: "Prepare surfaces, patch minor imperfections, apply primer as needed, and apply finish coats.",
    includedWork: "Masking and protection, wall and trim painting, daily cleanup.",
    exclusions: "Major drywall replacement and structural repairs unless added in options.",
    recommendations: "Finalize sheen and color schedule prior to start date.",
    importantNotes: "Furniture should be moved from immediate work zones before mobilization.",
    referencesText: "Interior residential references available upon request.",
    closingText: "Thank you for the opportunity. We look forward to delivering a clean professional result.",
  },
  exterior_painting: {
    projectSummary: "Exterior coating project designed for durability, curb appeal, and long-term protection.",
    scopeOfWork: "Power wash, scrape, sand, spot-prime, caulk, and apply exterior finish coats.",
    includedWork: "Surface preparation, minor sealant touchups, and finish application.",
    exclusions: "Wood replacement, rot remediation, and carpentry unless listed.",
    recommendations: "Schedule around weather windows for best curing performance.",
    importantNotes: "Access to all elevations and perimeter must be available during work days.",
    referencesText: "Exterior project references and before/after images are available.",
    closingText: "We appreciate the opportunity to protect and refresh your property.",
  },
  cabinet_refinishing: {
    projectSummary: "Cabinet refinishing with controlled prep and durable finish process.",
    scopeOfWork: "Degrease, sand, prime, and spray or brush/roll finish system based on selected option.",
    includedWork: "Door/drawer labeling, prep, finish application, and reinstallation.",
    exclusions: "Hardware replacement and interior cabinet modifications unless listed.",
    recommendations: "Approve color sample before production coating.",
    importantNotes: "Kitchen access windows should be coordinated for production efficiency.",
    referencesText: "Cabinet refinishing references available upon request.",
    closingText: "Thank you for trusting us with your cabinet refinishing project.",
  },
  deck_restoration: {
    projectSummary: "Deck restoration focused on prep quality, coating longevity, and visual consistency.",
    scopeOfWork: "Clean, sand, repair minor imperfections, and apply stain or coating system.",
    includedWork: "Decking and rail prep, finish application, and cleanup.",
    exclusions: "Board replacement and structural framing repair unless listed.",
    recommendations: "Select finish type based on sun exposure and maintenance preference.",
    importantNotes: "Foot traffic should be restricted during curing period.",
    referencesText: "Deck restoration references can be provided.",
    closingText: "We look forward to restoring your deck with a durable finish system.",
  },
  pergola_restoration: {
    projectSummary: "Pergola restoration to refresh appearance and improve weather resistance.",
    scopeOfWork: "Prep, sanding, spot repairs, and protective coating application.",
    includedWork: "Surface prep, coating/stain, and cleanup.",
    exclusions: "Structural replacement unless added as an option.",
    recommendations: "Annual maintenance wash improves finish lifespan.",
    importantNotes: "Work sequencing may vary based on sun and weather conditions.",
    referencesText: "Pergola references are available upon request.",
    closingText: "Thank you for the opportunity to restore your pergola.",
  },
  trim_restoration: {
    projectSummary: "Trim restoration focused on crisp lines and durable finish quality.",
    scopeOfWork: "Prepare surfaces, repair minor defects, prime, and apply finish coats.",
    includedWork: "Detail prep, caulking touchups, and finish coats.",
    exclusions: "Major carpentry replacement unless listed.",
    recommendations: "Match finish sheen to adjacent surfaces for visual consistency.",
    importantNotes: "Existing substrate condition may impact prep effort.",
    referencesText: "Trim restoration references available upon request.",
    closingText: "We appreciate the opportunity to improve your trim finishes.",
  },
  wallpaper_removal: {
    projectSummary: "Wallpaper removal and wall prep for repaint-ready surfaces.",
    scopeOfWork: "Remove wallpaper, clean adhesive residue, patch and smooth walls for finish prep.",
    includedWork: "Wallpaper removal, wall prep, and cleanup.",
    exclusions: "Large drywall replacement and moisture remediation unless listed.",
    recommendations: "Confirm final wall texture and paint plan before finishing.",
    importantNotes: "Hidden wall conditions may only appear after paper removal.",
    referencesText: "Wallpaper removal references available upon request.",
    closingText: "Thank you for the opportunity to prepare your space for a fresh finish.",
  },
  drywall_repair: {
    projectSummary: "Drywall repair scope built for smooth finish-ready surfaces.",
    scopeOfWork: "Patch damaged areas, tape/mud as required, sand, and prep for primer/paint.",
    includedWork: "Surface repair and prep to paint-ready condition.",
    exclusions: "Framing correction and moisture-source remediation unless listed.",
    recommendations: "Allow adequate curing and sanding stages for best finish quality.",
    importantNotes: "Dust control setup will be used in active work zones.",
    referencesText: "Drywall repair examples are available upon request.",
    closingText: "We appreciate the opportunity to restore your walls properly.",
  },
  commercial_painting: {
    projectSummary: "Commercial painting scope built for schedule reliability and professional finishes.",
    scopeOfWork: "Coordinate access, prep surfaces, and apply commercial-grade coating systems.",
    includedWork: "Site protection, prep, coatings, and punch-list walkthrough.",
    exclusions: "After-hours premium scheduling unless listed as an option.",
    recommendations: "Align phase plan with occupancy schedule to reduce disruption.",
    importantNotes: "Site coordination contact should be designated before kickoff.",
    referencesText: "Commercial references and certificates available upon request.",
    closingText: "Thank you for considering us for your commercial painting needs.",
  },
  new_construction: {
    projectSummary: "New construction finish package for consistent quality across project phases.",
    scopeOfWork: "Prime, caulk, and apply finish systems per approved schedule and specs.",
    includedWork: "Standard production prep and coating application.",
    exclusions: "Change-order scope outside approved plan unless added.",
    recommendations: "Finalize color schedule and punch milestones in advance.",
    importantNotes: "Work is sequenced around project readiness and trade completion.",
    referencesText: "New construction project references available.",
    closingText: "We look forward to supporting your construction schedule with dependable delivery.",
  },
  property_maintenance: {
    projectSummary: "Recurring property maintenance scope to protect finishes and control long-term costs.",
    scopeOfWork: "Inspect and address touch-ups, wear areas, and preventive coating needs.",
    includedWork: "Scheduled touch-up execution and condition reporting.",
    exclusions: "Major restoration or replacement outside maintenance scope.",
    recommendations: "Use quarterly review cycles for best long-term asset performance.",
    importantNotes: "Maintenance windows should be coordinated with occupancy requirements.",
    referencesText: "Maintenance program references are available.",
    closingText: "Thank you for the opportunity to maintain your property proactively.",
  },
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
  const [collapsedOptions, setCollapsedOptions] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState({
    customerId: 0,
    projectName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    status: "draft" as (typeof PROPOSAL_STATUSES)[number],
    proposalTemplate: null as (typeof PROPOSAL_TEMPLATES)[number] | null,
    proposalType: null as (typeof PROPOSAL_TYPES)[number] | null,
    projectSummary: "",
    scopeOfWork: "",
    includedWork: "",
    exclusions: "",
    importantNotes: "",
    recommendations: "",
    closingText: "",
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
    paintColors: [] as PaintColorDraft[],
  });

  const update = api.proposals.update.useMutation({
    onSuccess: () => {
      toast.success("Proposal saved");
      utils.proposals.byId.invalidate({ id });
      utils.proposals.list.invalidate();
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
      proposalTemplate: (proposal.proposalTemplate as (typeof PROPOSAL_TEMPLATES)[number] | null) || null,
      proposalType: (proposal.proposalType as (typeof PROPOSAL_TYPES)[number] | null) || null,
      projectSummary: proposal.projectSummary || "",
      scopeOfWork: proposal.scopeOfWork || "",
      includedWork: proposal.includedWork || "",
      exclusions: proposal.exclusions || "",
      importantNotes: proposal.importantNotes || "",
      recommendations: proposal.recommendations || "",
      closingText: proposal.closingText || "",
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
      paintColors: proposal.paintColors.map((p) => ({
        area: p.area,
        colorName: p.colorName,
        brand: p.brand || "",
        finish: p.finish || "",
        notes: p.notes || "",
        sortOrder: p.sortOrder,
      })),
    });
  }, [proposal]);

  const isReadOnly = form.status === "converted";
  const totalOptionsAmount = useMemo(
    () =>
      form.options.reduce((sum, option) => {
        const parsed = parseFloat(option.price);
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }, 0),
    [form.options]
  );

  const savedOptionsPreview = useMemo(
    () =>
      form.options.filter((o) =>
        isMeaningfulRow([o.title, o.description, o.scope]) || o.price.trim().length > 0
      ),
    [form.options]
  );

  const savedAttachmentsPreview = useMemo(
    () =>
      form.attachments.filter((a) =>
        isMeaningfulRow([a.category, a.fileName, a.fileUrl, a.notes])
      ),
    [form.attachments]
  );

  const savedPaintColorsPreview = useMemo(
    () =>
      form.paintColors.filter((p) =>
        isMeaningfulRow([p.area, p.colorName, p.brand, p.finish, p.notes])
      ),
    [form.paintColors]
  );

  const onSave = () => {
    const optionsPayload = form.options
      .filter((o) => isMeaningfulRow([o.title, o.description, o.scope]) || o.price.trim().length > 0)
      .map((o, index) => ({
        title: o.title.trim() || `Option ${index + 1}`,
        description: o.description.trim() || undefined,
        scope: o.scope.trim() || undefined,
        price: o.price.trim() === "" ? null : parseFloat(o.price),
        isVisible: o.isVisible,
        sortOrder: o.sortOrder || index,
      }));

    const attachmentsPayload = form.attachments
      .filter((a) => isMeaningfulRow([a.category, a.fileName, a.fileUrl, a.notes]))
      .map((a, index) => ({
        category: a.category.trim() || "other",
        fileName: a.fileName.trim() || `Attachment ${index + 1}`,
        fileUrl: a.fileUrl.trim() || undefined,
        notes: a.notes.trim() || undefined,
        sortOrder: a.sortOrder || index,
      }));

    const paintColorsPayload = form.paintColors
      .filter((p) => isMeaningfulRow([p.area, p.colorName, p.brand, p.finish, p.notes]))
      .map((p, index) => ({
        area: p.area.trim() || "General",
        colorName: p.colorName.trim() || "Unspecified",
        brand: p.brand.trim() || undefined,
        finish: p.finish.trim() || undefined,
        notes: p.notes.trim() || undefined,
        sortOrder: p.sortOrder || index,
      }));

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
        proposalTemplate: form.proposalTemplate,
        proposalType: form.proposalType,
        projectSummary: form.projectSummary,
        scopeOfWork: form.scopeOfWork,
        includedWork: form.includedWork,
        exclusions: form.exclusions,
        importantNotes: form.importantNotes,
        recommendations: form.recommendations,
        closingText: form.closingText,
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
        options: optionsPayload,
        attachments: attachmentsPayload,
        paintColors: paintColorsPayload,
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

  const applyTemplate = (template: (typeof PROPOSAL_TEMPLATES)[number]) => {
    const preset = TEMPLATE_PRESETS[template];
    setForm((f) => ({
      ...f,
      proposalTemplate: template,
      projectSummary: preset.projectSummary,
      scopeOfWork: preset.scopeOfWork,
      includedWork: preset.includedWork,
      exclusions: preset.exclusions,
      recommendations: preset.recommendations,
      importantNotes: preset.importantNotes,
      referencesText: preset.referencesText,
      closingText: preset.closingText,
    }));
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

            <div>
              <label className="label">Proposal Type</label>
              <select
                className="input"
                value={form.proposalType || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    proposalType: e.target.value ? (e.target.value as (typeof PROPOSAL_TYPES)[number]) : null,
                  }))
                }
                disabled={isReadOnly}
              >
                <option value="">Select type</option>
                {PROPOSAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Proposal Template</label>
              <select
                className="input"
                value={form.proposalTemplate || ""}
                onChange={(e) => {
                  const template = e.target.value as (typeof PROPOSAL_TEMPLATES)[number] | "";
                  if (!template) {
                    setForm((f) => ({ ...f, proposalTemplate: null }));
                    return;
                  }
                  applyTemplate(template);
                }}
                disabled={isReadOnly}
              >
                <option value="">Select template</option>
                {PROPOSAL_TEMPLATES.map((template) => (
                  <option key={template} value={template}>
                    {template.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <FieldText label="Project Name" value={form.projectName} onChange={(v) => setForm((f) => ({ ...f, projectName: v }))} disabled={isReadOnly} className="md:col-span-3" />
            <FieldText label="Street" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} disabled={isReadOnly} className="md:col-span-3" />
            <FieldText label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={isReadOnly} />
            <FieldText label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} disabled={isReadOnly} />
            <FieldText label="Zip" value={form.zipCode} onChange={(v) => setForm((f) => ({ ...f, zipCode: v }))} disabled={isReadOnly} />

            <FieldArea label="AI Notes" value={form.aiAssistantNotes} onChange={(v) => setForm((f) => ({ ...f, aiAssistantNotes: v }))} disabled={isReadOnly} className="md:col-span-3" />
            <div className="md:col-span-3 flex justify-end">
              <button className="btn btn-secondary" disabled>
                Generate Proposal
              </button>
            </div>

            <FieldNumber label="Materials Budget" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} disabled={isReadOnly} />
            <FieldNumber label="Labor Budget" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} disabled={isReadOnly} />
            <FieldNumber label="Subcontractor Budget" value={form.subcontractorBudget} onChange={(v) => setForm((f) => ({ ...f, subcontractorBudget: v }))} disabled={isReadOnly} />
            <FieldNumber label="Total Amount" value={form.totalAmount} onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))} disabled={isReadOnly} />
            <FieldDate label="Expected Start" value={form.expectedStartDate} onChange={(v) => setForm((f) => ({ ...f, expectedStartDate: v }))} disabled={isReadOnly} />
            <FieldDate label="Expected End" value={form.expectedEndDate} onChange={(v) => setForm((f) => ({ ...f, expectedEndDate: v }))} disabled={isReadOnly} />
          </div>
        </div>
      )}

      {tab === "scope" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Scope Builder</h2>
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            <FieldArea label="Project Summary" value={form.projectSummary} onChange={(v) => setForm((f) => ({ ...f, projectSummary: v }))} disabled={isReadOnly} className="md:col-span-2" />
            <FieldArea label="Scope of Work" value={form.scopeOfWork} onChange={(v) => setForm((f) => ({ ...f, scopeOfWork: v }))} disabled={isReadOnly} />
            <FieldArea label="Included Work" value={form.includedWork} onChange={(v) => setForm((f) => ({ ...f, includedWork: v }))} disabled={isReadOnly} />
            <FieldArea label="Excluded Work" value={form.exclusions} onChange={(v) => setForm((f) => ({ ...f, exclusions: v }))} disabled={isReadOnly} />
            <FieldArea label="Important Notes" value={form.importantNotes} onChange={(v) => setForm((f) => ({ ...f, importantNotes: v }))} disabled={isReadOnly} />
            <FieldArea label="Recommendations" value={form.recommendations} onChange={(v) => setForm((f) => ({ ...f, recommendations: v }))} disabled={isReadOnly} />
            <FieldArea label="References" value={form.referencesText} onChange={(v) => setForm((f) => ({ ...f, referencesText: v }))} disabled={isReadOnly} />
            <FieldArea label="Closing" value={form.closingText} onChange={(v) => setForm((f) => ({ ...f, closingText: v }))} disabled={isReadOnly} />
            <FieldArea label="Proposal Notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} disabled={isReadOnly} className="md:col-span-2" />
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Budget and Pricing</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <FieldNumber label="Materials Budget" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} disabled={isReadOnly} />
              <FieldNumber label="Labor Budget" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} disabled={isReadOnly} />
              <FieldNumber label="Subcontractor Budget" value={form.subcontractorBudget} onChange={(v) => setForm((f) => ({ ...f, subcontractorBudget: v }))} disabled={isReadOnly} />
              <FieldNumber label="Total Amount" value={form.totalAmount} onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))} disabled={isReadOnly} />
              <FieldArea label="Payment Schedule" value={form.paymentSchedule} onChange={(v) => setForm((f) => ({ ...f, paymentSchedule: v }))} disabled={isReadOnly} className="md:col-span-2" />
              <FieldArea label="Terms" value={form.termsAndConditions} onChange={(v) => setForm((f) => ({ ...f, termsAndConditions: v }))} disabled={isReadOnly} className="md:col-span-2" />
            </div>
          </div>

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
            <div className="space-y-3">
              {form.options.length === 0 ? (
                <div className="text-sm text-slate-500">No options yet. Add unlimited options for this proposal.</div>
              ) : (
                form.options.map((option, index) => {
                  const collapsed = collapsedOptions[index] ?? false;
                  return (
                    <div key={index} className="rounded-md border border-slate-200">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left flex items-center justify-between"
                        onClick={() => setCollapsedOptions((prev) => ({ ...prev, [index]: !collapsed }))}
                      >
                        <span className="text-sm font-medium">{option.title || `Option ${index + 1}`}</span>
                        <span className="text-xs text-slate-500">{collapsed ? "Expand" : "Collapse"}</span>
                      </button>
                      {!collapsed && (
                        <div className="px-3 pb-3 grid md:grid-cols-2 gap-3">
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
                            label="Included Work"
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
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "paint-colors" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Paint Colors</h2>
            <button
              className="btn btn-secondary"
              disabled={isReadOnly}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  paintColors: [
                    ...f.paintColors,
                    { area: "", colorName: "", brand: "", finish: "", notes: "", sortOrder: f.paintColors.length },
                  ],
                }))
              }
            >
              Add Paint Color
            </button>
          </div>
          <div className="space-y-4">
            {form.paintColors.length === 0 ? (
              <div className="text-sm text-slate-500">No paint colors yet.</div>
            ) : (
              form.paintColors.map((color, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-3 grid md:grid-cols-2 gap-3">
                  <FieldText
                    label="Area"
                    value={color.area}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paintColors: f.paintColors.map((current, i) => (i === index ? { ...current, area: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldText
                    label="Color"
                    value={color.colorName}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paintColors: f.paintColors.map((current, i) => (i === index ? { ...current, colorName: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldText
                    label="Brand"
                    value={color.brand}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paintColors: f.paintColors.map((current, i) => (i === index ? { ...current, brand: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldText
                    label="Finish"
                    value={color.finish}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paintColors: f.paintColors.map((current, i) => (i === index ? { ...current, finish: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                  />
                  <FieldArea
                    label="Notes"
                    value={color.notes}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paintColors: f.paintColors.map((current, i) => (i === index ? { ...current, notes: v } : current)),
                      }))
                    }
                    disabled={isReadOnly}
                    className="md:col-span-2"
                  />
                  <FieldNumber
                    label="Sort Order"
                    value={color.sortOrder}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paintColors: f.paintColors.map((current, i) => (i === index ? { ...current, sortOrder: Math.trunc(v) } : current)),
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
                          paintColors: f.paintColors.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove Color
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

      {tab === "preview" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Proposal Preview</h2>
          <div className="rounded-md border border-slate-200 p-5 space-y-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Proposal</div>
              <div className="text-xl font-semibold">{form.projectName || "Untitled Proposal"}</div>
              <div className="text-slate-600 mt-1">{proposal.proposalNumber} · {customerSearch || "Customer"}</div>
              <div className="text-slate-600">{[form.address, form.city, form.state, form.zipCode].filter(Boolean).join(", ") || "Address pending"}</div>
            </div>

            <PreviewSection title="Project Summary" text={form.projectSummary} />
            <PreviewSection title="Scope of Work" text={form.scopeOfWork} />
            <PreviewSection title="Included Work" text={form.includedWork} />
            <PreviewSection title="Excluded Work" text={form.exclusions} />
            <PreviewSection title="Recommendations" text={form.recommendations} />
            <PreviewSection title="Important Notes" text={form.importantNotes} />

            <div>
              <h3 className="font-semibold mb-2">Options</h3>
              {savedOptionsPreview.filter((o) => o.isVisible).length === 0 ? (
                <p className="text-slate-500">No visible options added.</p>
              ) : (
                <div className="space-y-2">
                  {savedOptionsPreview
                    .filter((o) => o.isVisible)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((o, idx) => (
                      <div key={`${o.title}-${idx}`} className="border border-slate-100 rounded-md p-3">
                        <div className="font-medium">{o.title || `Option ${idx + 1}`}</div>
                        <div className="text-slate-700">{o.description || "No description."}</div>
                        <div className="text-slate-700">{o.scope || "No included work entered."}</div>
                        <div className="font-semibold mt-1">{o.price.trim() ? formatCurrency(parseFloat(o.price) || 0) : "TBD"}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Paint Colors</h3>
              {savedPaintColorsPreview.length === 0 ? (
                <p className="text-slate-500">No paint colors added.</p>
              ) : (
                <div className="space-y-2">
                  {savedPaintColorsPreview
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((p, idx) => (
                      <div key={`${p.area}-${p.colorName}-${idx}`} className="border border-slate-100 rounded-md p-3">
                        <div className="font-medium">{p.area || "General"}</div>
                        <div className="text-slate-700">{p.colorName || "Unspecified"}</div>
                        <div className="text-slate-600">{[p.brand, p.finish].filter(Boolean).join(" · ") || ""}</div>
                        {p.notes ? <div className="text-slate-600 mt-1">{p.notes}</div> : null}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <PreviewSection title="References" text={form.referencesText} />
            <PreviewSection title="Closing" text={form.closingText} />

            <div>
              <h3 className="font-semibold mb-2">Attachments List</h3>
              {savedAttachmentsPreview.length === 0 ? (
                <p className="text-slate-500">No attachments listed.</p>
              ) : (
                <ul className="list-disc ml-5 space-y-1">
                  {savedAttachmentsPreview
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((a, idx) => (
                      <li key={`${a.fileName}-${idx}`}>{a.category}: {a.fileName || "Untitled file"}</li>
                    ))}
                </ul>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200">
              <h3 className="font-semibold mb-2">Pricing</h3>
              <div className="grid md:grid-cols-2 gap-2">
                <div>Materials: {formatCurrency(form.materialsBudget)}</div>
                <div>Labor: {formatCurrency(form.laborBudget)}</div>
                <div>Subcontractor: {formatCurrency(form.subcontractorBudget)}</div>
                <div className="font-semibold">Total: {formatCurrency(form.totalAmount)}</div>
              </div>
            </div>
          </div>
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

      {tab === "activity" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Activity</h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <Stat label="Created" value={formatDateTime(proposal.createdAt)} />
            <Stat label="Updated" value={formatDateTime(proposal.updatedAt)} />
            <Stat label="Sent" value={proposal.sentAt ? formatDateTime(proposal.sentAt) : "—"} />
            <Stat label="Approved" value={proposal.approvedAt ? formatDateTime(proposal.approvedAt) : "—"} />
            <Stat label="Current Status" value={form.status} />
            <Stat label="Last Save" value={update.isPending ? "Saving..." : "Saved"} />
          </div>
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

function PreviewSection({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-slate-700 whitespace-pre-wrap">{text || "—"}</p>
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
