"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

const TABS = [
  { id: "scope", label: "Scope" },
  { id: "pricing", label: "Pricing" },
  { id: "paint-colors", label: "Paint Colors" },
  { id: "attachments", label: "Attachments" },
  { id: "preview", label: "Preview" },
  { id: "activity", label: "Activity" },
] as const;

type ProposalTab = (typeof TABS)[number]["id"];
const PROPOSAL_STATUSES = ["draft", "ready", "sent", "viewed", "approved", "declined", "follow_up", "converted"] as const;
const STATUS_OPTIONS: Array<{ value: (typeof PROPOSAL_STATUSES)[number]; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Rejected" },
  { value: "converted", label: "Converted" },
];
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
  brand: string;
  product: string;
  colorName: string;
  colorCode: string;
  finish: string;
  notes: string;
  sortOrder: number;
};

type SectionDraft = {
  templateKey: string;
  title: string;
  description: string;
  bulletItems: string[];
  notes: string;
  sortOrder: number;
};

const ATTACHMENT_CATEGORIES = [
  "IS Painting Booklet",
  "Certificate of Insurance",
  "Photos",
  "Estimate Breakdown",
  "Other",
] as const;

const SECTION_TEMPLATES = [
  "interior_painting",
  "exterior_painting",
  "deck_restoration",
  "pergola",
  "cabinets",
  "trim_restoration",
  "wallpaper_removal",
  "drywall_repair",
  "commercial",
  "custom_section",
] as const;

const SECTION_PRESETS: Record<(typeof SECTION_TEMPLATES)[number], Omit<SectionDraft, "sortOrder">> = {
  interior_painting: {
    templateKey: "interior_painting",
    title: "Interior Painting",
    description: "Prepare, protect, and paint interior surfaces for a clean durable finish.",
    bulletItems: ["Mask and protect work areas", "Patch and prep surfaces", "Prime as needed", "Apply finish coats"],
    notes: "Coordinate color and sheen selections before production.",
  },
  exterior_painting: {
    templateKey: "exterior_painting",
    title: "Exterior Painting",
    description: "Restore and protect exterior surfaces with thorough preparation and premium coatings.",
    bulletItems: ["Wash exterior surfaces", "Scrape and sand loose paint", "Prime exposed areas", "Apply exterior finish coats"],
    notes: "Scheduling depends on weather and dry-time windows.",
  },
  deck_restoration: {
    templateKey: "deck_restoration",
    title: "Deck Restoration",
    description: "Restore deck surfaces with prep, sanding, and protective finish application.",
    bulletItems: ["Clean deck surfaces", "Sand deck boards and rails", "Prep worn areas", "Apply stain or coating system"],
    notes: "Foot traffic must stay off surfaces during cure period.",
  },
  pergola: {
    templateKey: "pergola",
    title: "Pergola",
    description: "Prepare and refinish pergola components for weather protection and appearance.",
    bulletItems: ["Wash and prep structure", "Sand deteriorated areas", "Prime/spot repair as needed", "Apply finish system"],
    notes: "Access and sun exposure may affect sequencing.",
  },
  cabinets: {
    templateKey: "cabinets",
    title: "Cabinet Refinishing",
    description: "Controlled cabinet refinishing workflow for a smooth durable finish.",
    bulletItems: ["Label doors and drawers", "Degrease and sand surfaces", "Prime surfaces", "Spray or apply finish coats"],
    notes: "Final color approval required before finishing.",
  },
  trim_restoration: {
    templateKey: "trim_restoration",
    title: "Trim Restoration",
    description: "Restore trim surfaces for crisp appearance and durable protection.",
    bulletItems: ["Prep trim surfaces", "Caulk and repair minor defects", "Prime as needed", "Apply finish coats"],
    notes: "Substrate condition may affect final prep scope.",
  },
  wallpaper_removal: {
    templateKey: "wallpaper_removal",
    title: "Wallpaper Removal",
    description: "Remove wallpaper and prepare walls for a paint-ready finish.",
    bulletItems: ["Remove wallpaper", "Clean adhesive residue", "Patch wall imperfections", "Prep surface for finish work"],
    notes: "Hidden wall conditions may be discovered after removal.",
  },
  drywall_repair: {
    templateKey: "drywall_repair",
    title: "Drywall Repair",
    description: "Repair damaged drywall and prepare surfaces to paint-ready condition.",
    bulletItems: ["Patch damaged areas", "Tape and mud as required", "Sand smooth", "Prime repaired areas"],
    notes: "Drying and sanding cycles affect schedule.",
  },
  commercial: {
    templateKey: "commercial",
    title: "Commercial Painting",
    description: "Commercial painting scope organized around access, schedule, and production efficiency.",
    bulletItems: ["Coordinate with site contact", "Protect adjacent areas", "Prep surfaces", "Apply specified coating system"],
    notes: "Phasing can be aligned to occupancy schedule.",
  },
  custom_section: {
    templateKey: "custom_section",
    title: "Custom Section",
    description: "",
    bulletItems: [""],
    notes: "",
  },
};

function isMeaningfulRow(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function sanitizeNumericInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [rawInteger, ...rawFractionParts] = cleaned.split(".");
  const integerPart = rawInteger.replace(/^0+(?=\d)/, "");
  const fractionPart = rawFractionParts.join("");
  return rawFractionParts.length ? `${integerPart || "0"}.${fractionPart}` : integerPart;
}

function parseCurrencyValue(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
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
  const [tab, setTab] = useState<ProposalTab>("scope");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery({ search: customerSearch.trim() || undefined }, { enabled: !!proposal });
  const [collapsedOptions, setCollapsedOptions] = useState<Record<number, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [selectedSectionTemplate, setSelectedSectionTemplate] = useState<(typeof SECTION_TEMPLATES)[number]>("interior_painting");
  const [selectedAttachmentCategory, setSelectedAttachmentCategory] = useState<(typeof ATTACHMENT_CATEGORIES)[number]>("Other");
  const [selectedExamples, setSelectedExamples] = useState<Array<{ id: number; title: string; proposalCategory: string; proposalType: string | null; tags: string[] }>>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
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
    sections: [] as SectionDraft[],
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

  const generateProposalDraft = api.proposals.generateProposalDraft.useMutation({
    onSuccess: (draft) => {
      setSelectedExamples(draft.selectedExamples || []);
      setForm((current) => ({
        ...current,
        projectSummary: draft.projectSummary || current.projectSummary,
        scopeOfWork: draft.scopeOfWork || current.scopeOfWork,
        importantNotes: draft.importantNotes || current.importantNotes,
        recommendations: draft.recommendations || current.recommendations,
        referencesText: draft.referencesText || current.referencesText,
        closingText: draft.closingText || current.closingText,
        paymentSchedule: current.paymentSchedule || draft.paymentSchedule || current.paymentSchedule,
        totalAmount: current.totalAmount > 0 ? current.totalAmount : draft.totalAmount ?? current.totalAmount,
        sections: draft.sections.length
          ? draft.sections.map((section, index) => ({
              templateKey: section.templateKey || "custom_section",
              title: section.title,
              description: section.description || "",
              bulletItems: section.bulletItems.length ? section.bulletItems : [""],
              notes: section.notes || "",
              sortOrder: section.sortOrder ?? index,
            }))
          : current.sections,
      }));
      toast.success("Proposal draft generated. Review and edit as needed.");
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
      sections: proposal.sections.length
        ? proposal.sections.map((section) => ({
            templateKey: section.templateKey || "custom_section",
            title: section.title,
            description: section.description || "",
            bulletItems: section.bulletItems.length ? section.bulletItems : [""],
            notes: section.notes || "",
            sortOrder: section.sortOrder,
          }))
        : buildLegacySections(proposal),
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
        brand: p.brand || "",
        product: p.product || "",
        colorName: p.colorName,
        colorCode: p.colorCode || "",
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
        const parsed = parseCurrencyValue(option.price);
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
        isMeaningfulRow([p.area, p.brand, p.product, p.colorName, p.colorCode, p.finish, p.notes])
      ),
    [form.paintColors]
  );

  const savedSectionsPreview = useMemo(
    () =>
      form.sections.filter((section) =>
        isMeaningfulRow([section.title, section.description, section.notes]) || section.bulletItems.some((item) => item.trim().length > 0)
      ),
    [form.sections]
  );

  const greetingSection = useMemo(
    () =>
      savedSectionsPreview.find(
        (section) => section.templateKey === "greeting" || section.title.toLowerCase().includes("greeting")
      ),
    [savedSectionsPreview]
  );

  const activityItems = useMemo(() => {
    if (!proposal) return [] as { label: string; timestamp: Date; detail?: string }[];

    const items: { label: string; timestamp: Date; detail?: string }[] = [
      { label: "Proposal Created", timestamp: new Date(proposal.createdAt), detail: proposal.proposalNumber },
    ];

    if (new Date(proposal.updatedAt).getTime() !== new Date(proposal.createdAt).getTime()) {
      items.push({ label: "Proposal Edited", timestamp: new Date(proposal.updatedAt), detail: proposal.projectName });
    }

    proposal.sections.forEach((section) => {
      items.push({ label: "Section Added", timestamp: new Date(section.createdAt), detail: section.title });
    });

    proposal.options.forEach((option) => {
      items.push({ label: "Option Added", timestamp: new Date(option.createdAt), detail: option.title });
    });

    proposal.paintColors.forEach((color) => {
      items.push({ label: "Paint Color Added", timestamp: new Date(color.createdAt), detail: `${color.area}: ${color.colorName}` });
    });

    proposal.attachments.forEach((attachment) => {
      items.push({ label: "Attachment Uploaded", timestamp: new Date(attachment.createdAt), detail: attachment.fileName });
    });

    const statusLabel =
      proposal.status === "declined" ? "Rejected" : proposal.status === "follow_up" ? "Follow Up" : proposal.status;
    items.push({ label: "Status Changed", timestamp: new Date(proposal.updatedAt), detail: statusLabel });

    if (proposal.sentAt) items.push({ label: "Status Changed", timestamp: new Date(proposal.sentAt), detail: "Sent" });
    if (proposal.approvedAt) items.push({ label: "Status Changed", timestamp: new Date(proposal.approvedAt), detail: "Approved" });
    if (proposal.status === "converted") items.push({ label: "Converted to Job", timestamp: new Date(proposal.updatedAt), detail: "Converted" });

    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [proposal]);

  const onSave = () => {
    const optionsPayload = form.options
      .filter((o) => isMeaningfulRow([o.title, o.description, o.scope]) || o.price.trim().length > 0)
      .map((o, index) => {
        const parsedPrice = parseCurrencyValue(o.price);
        return {
          title: o.title.trim() || `Option ${index + 1}`,
          description: o.description.trim() || undefined,
          scope: o.scope.trim() || undefined,
          price: o.price.trim() === "" || !Number.isFinite(parsedPrice) ? null : parsedPrice,
          isVisible: o.isVisible,
          sortOrder: o.sortOrder || index,
        };
      });

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
      .filter((p) => isMeaningfulRow([p.area, p.brand, p.product, p.colorName, p.colorCode, p.finish, p.notes]))
      .map((p, index) => ({
        area: p.area.trim() || "General",
        brand: p.brand.trim() || undefined,
        product: p.product.trim() || undefined,
        colorName: p.colorName.trim() || "Unspecified",
        colorCode: p.colorCode.trim() || undefined,
        finish: p.finish.trim() || undefined,
        notes: p.notes.trim() || undefined,
        sortOrder: p.sortOrder || index,
      }));

    const sectionsPayload = form.sections
      .filter((section) => isMeaningfulRow([section.title, section.description, section.notes]) || section.bulletItems.some((item) => item.trim().length > 0))
      .map((section, index) => ({
        templateKey: section.templateKey || undefined,
        title: section.title.trim() || `Section ${index + 1}`,
        description: section.description.trim() || undefined,
        bulletItems: section.bulletItems.map((item) => item.trim()).filter(Boolean),
        notes: section.notes.trim() || undefined,
        sortOrder: section.sortOrder || index,
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
        sections: sectionsPayload,
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

  const addSection = (templateKey: (typeof SECTION_TEMPLATES)[number]) => {
    const preset = SECTION_PRESETS[templateKey];
    setForm((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          ...preset,
          bulletItems: [...preset.bulletItems],
          sortOrder: current.sections.length,
        },
      ],
    }));
  };

  const duplicateSection = (index: number) => {
    setForm((current) => {
      const target = current.sections[index];
      return {
        ...current,
        sections: current.sections.flatMap((section, i) =>
          i === index
            ? [section, { ...target, bulletItems: [...target.bulletItems], sortOrder: current.sections.length }]
            : [section]
        ),
      };
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setForm((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.sections.length) return current;
      const sections = [...current.sections];
      const [item] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, item);
      return {
        ...current,
        sections: sections.map((section, sortOrder) => ({ ...section, sortOrder })),
      };
    });
  };

  const openAttachmentPicker = () => attachmentInputRef.current?.click();

  const previewAttachment = (attachment: AttachmentDraft) => {
    if (!attachment.fileUrl) {
      toast.error("Preview not available. Please download this file.");
      return;
    }

    const fileName = attachment.fileName.toLowerCase();
    const dataUrl = attachment.fileUrl.toLowerCase();
    const isImage = dataUrl.startsWith("data:image/") || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(fileName);
    const isPdf = dataUrl.startsWith("data:application/pdf") || fileName.endsWith(".pdf");

    if (!isImage && !isPdf) {
      toast.error("Preview not available. Please download this file.");
      return;
    }

    window.open(attachment.fileUrl, "_blank", "noopener,noreferrer");
  };

  const onAttachmentSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileUrl = await readFileAsDataUrl(file);
    setForm((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        {
          category: selectedAttachmentCategory,
          fileName: file.name,
          fileUrl,
          notes: "",
          sortOrder: current.attachments.length,
        },
      ],
    }));
    event.target.value = "";
  };

  if (isLoading || !proposal) return <div className="text-slate-500">Loading…</div>;

  return (
    <>
      <PageHeader title={proposal.projectName} description={`${proposal.proposalNumber} · ${proposal.customer.name}`} />

      {isReadOnly && (
        <div className="card p-4 mb-4 border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          This proposal is converted and now read-only. Operational updates should happen in the Job workspace.
        </div>
      )}

      <div className="card p-5 mb-4">
        <div className="grid md:grid-cols-4 gap-3 items-start">
          <HeaderStat label="Proposal Number" value={proposal.proposalNumber} />
          <HeaderStat label="Created" value={formatDateTime(proposal.createdAt)} />
          <HeaderStat label="Last Updated" value={formatDateTime(proposal.updatedAt)} />
          <div className="flex gap-2 md:justify-end">
            <button
              className="btn btn-secondary"
              onClick={() => toast.info("Proposal-to-job conversion remains intentionally deferred.")}
            >
              Convert to Job
            </button>
            <button className="btn btn-primary" disabled={update.isPending || isReadOnly} onClick={onSave}>
              {update.isPending ? "Saving..." : "Save Proposal"}
            </button>
          </div>

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

          <FieldText label="Project Name" value={form.projectName} onChange={(v) => setForm((f) => ({ ...f, projectName: v }))} disabled={isReadOnly} className="md:col-span-2" />
          <FieldText label="Property Address" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} disabled={isReadOnly} className="md:col-span-2" />
          <FieldText label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={isReadOnly} />
          <FieldText label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} disabled={isReadOnly} />
          <FieldText label="Zip" value={form.zipCode} onChange={(v) => setForm((f) => ({ ...f, zipCode: v }))} disabled={isReadOnly} />

          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as (typeof PROPOSAL_STATUSES)[number] }))}
              disabled={isReadOnly}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
              {form.status === "follow_up" ? <option value="follow_up">Follow Up (Legacy)</option> : null}
            </select>
          </div>
          <FieldDate label="Expected Start" value={form.expectedStartDate} onChange={(v) => setForm((f) => ({ ...f, expectedStartDate: v }))} disabled={isReadOnly} />
          <FieldDate label="Expected Finish" value={form.expectedEndDate} onChange={(v) => setForm((f) => ({ ...f, expectedEndDate: v }))} disabled={isReadOnly} />
        </div>
      </div>

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

      {tab === "scope" && (
        <div className="grid md:grid-cols-[280px,1fr] gap-4">
          <div className="card p-5 h-fit">
            <h2 className="text-base font-semibold mb-3">Proposal Builder</h2>
            <div className="space-y-3">
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
                    <option key={template} value={template}>{template.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Proposal Type</label>
                <select
                  className="input"
                  value={form.proposalType || ""}
                  onChange={(e) => setForm((f) => ({ ...f, proposalType: e.target.value ? (e.target.value as (typeof PROPOSAL_TYPES)[number]) : null }))}
                  disabled={isReadOnly}
                >
                  <option value="">Select type</option>
                  {PROPOSAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <FieldArea label="AI Draft Notes" value={form.aiAssistantNotes} onChange={(v) => setForm((f) => ({ ...f, aiAssistantNotes: v }))} disabled={isReadOnly} />
              <button
                className="btn btn-secondary w-full"
                disabled={isReadOnly || generateProposalDraft.isPending || !form.aiAssistantNotes.trim()}
                onClick={() =>
                  generateProposalDraft.mutate({
                    aiDraftNotes: form.aiAssistantNotes,
                    proposalTemplate: form.proposalTemplate,
                    proposalType: form.proposalType,
                    customerName: customerSearch,
                    projectName: form.projectName,
                    options: form.options.map((option) => ({
                      title: option.title,
                      description: option.description,
                      price: (() => {
                        const parsed = parseCurrencyValue(option.price);
                        return option.price.trim() && Number.isFinite(parsed) ? parsed : null;
                      })(),
                    })),
                    attachments: form.attachments.map((attachment) => attachment.fileName).filter(Boolean),
                  })
                }
              >
                {generateProposalDraft.isPending ? "Generating..." : "Generate Proposal"}
              </button>
              {selectedExamples.length > 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Proposal generated using</div>
                  <div className="space-y-1">
                    {selectedExamples.map((example) => (
                      <div key={example.id} className="text-slate-700">
                        ✓ {example.title}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <FieldArea label="Proposal Notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} disabled={isReadOnly} />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap gap-2 items-end justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Sections</h2>
                <p className="text-sm text-slate-500">Build the proposal one section at a time.</p>
              </div>
              <div className="flex gap-2">
                <select className="input" value={selectedSectionTemplate} onChange={(e) => setSelectedSectionTemplate(e.target.value as (typeof SECTION_TEMPLATES)[number])} disabled={isReadOnly}>
                  {SECTION_TEMPLATES.map((template) => <option key={template} value={template}>{template.replace(/_/g, " ")}</option>)}
                </select>
                <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => addSection(selectedSectionTemplate)}>Add Section</button>
              </div>
            </div>

            <FieldArea label="Project Summary" value={form.projectSummary} onChange={(v) => setForm((f) => ({ ...f, projectSummary: v }))} disabled={isReadOnly} className="mb-4" />

            <div className="space-y-3">
              {form.sections.length === 0 ? (
                <div className="text-sm text-slate-500">No sections yet. Add a template section to begin building the proposal.</div>
              ) : (
                form.sections.map((section, index) => {
                  const collapsed = collapsedSections[index] ?? false;
                  return (
                    <div key={index} className="rounded-md border border-slate-200">
                      <div className="px-3 py-2 flex flex-wrap gap-2 items-center justify-between border-b border-slate-100">
                        <button type="button" className="text-left font-medium" onClick={() => setCollapsedSections((prev) => ({ ...prev, [index]: !collapsed }))}>
                          {collapsed ? "▶" : "▼"} {section.title || `Section ${index + 1}`}
                        </button>
                        <div className="flex gap-2">
                          <button className="btn btn-secondary" disabled={isReadOnly || index === 0} onClick={() => moveSection(index, -1)}>Up</button>
                          <button className="btn btn-secondary" disabled={isReadOnly || index === form.sections.length - 1} onClick={() => moveSection(index, 1)}>Down</button>
                          <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => duplicateSection(index)}>Duplicate</button>
                          <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, sections: f.sections.filter((_, i) => i !== index).map((item, sortOrder) => ({ ...item, sortOrder })) }))}>Remove</button>
                        </div>
                      </div>
                      {!collapsed && (
                        <div className="p-3 grid md:grid-cols-2 gap-3">
                          <FieldText label="Title" value={section.title} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, title: v } : item) }))} disabled={isReadOnly} className="md:col-span-2" />
                          <FieldArea label="Description" value={section.description} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, description: v } : item) }))} disabled={isReadOnly} className="md:col-span-2" />
                          <FieldArea label="Bullet Items" value={section.bulletItems.join("\n")} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, bulletItems: v.split("\n") } : item) }))} disabled={isReadOnly} />
                          <FieldArea label="Notes" value={section.notes} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, notes: v } : item) }))} disabled={isReadOnly} />
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

      {tab === "pricing" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Internal Budget</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <FieldNumber label="Materials Budget" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} disabled={isReadOnly} currency />
              <FieldNumber label="Labor Budget" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} disabled={isReadOnly} currency />
              <FieldNumber label="Subcontractor Budget" value={form.subcontractorBudget} onChange={(v) => setForm((f) => ({ ...f, subcontractorBudget: v }))} disabled={isReadOnly} currency />
              <div>
                <label className="label">Internal Cost</label>
                <div className="input flex items-center">{formatCurrency(form.materialsBudget + form.laborBudget + form.subcontractorBudget)}</div>
              </div>
              <div>
                <label className="label">Internal Margin</label>
                <div className="input flex items-center">
                  {formatCurrency(form.totalAmount - (form.materialsBudget + form.laborBudget + form.subcontractorBudget))}
                </div>
              </div>
              <FieldNumber label="Final Proposal Price" value={form.totalAmount} onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))} disabled={isReadOnly} currency />
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
                          <div>
                            <label className="label">Price</label>
                            <input
                              className="input"
                              value={option.price}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.map((current, i) =>
                                    i === index ? { ...current, price: sanitizeNumericInput(e.target.value) } : current
                                  ),
                                }))
                              }
                              onBlur={() =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.map((current, i) => {
                                    if (i !== index) return current;
                                    const parsed = parseCurrencyValue(current.price);
                                    return Number.isFinite(parsed)
                                      ? { ...current, price: formatCurrency(parsed) }
                                      : { ...current, price: "" };
                                  }),
                                }))
                              }
                            />
                          </div>
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
                          <div>
                            <label className="label">Default Selected</label>
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
                          <div className="md:col-span-2 flex justify-end">
                            <button
                              className="btn btn-secondary mr-2"
                              disabled={isReadOnly}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.flatMap((current, i) =>
                                    i === index ? [current, { ...current, sortOrder: f.options.length }] : [current]
                                  ),
                                }))
                              }
                            >
                              Duplicate
                            </button>
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
            <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, paintColors: [...f.paintColors, { area: "", brand: "", product: "", colorName: "", colorCode: "", finish: "", notes: "", sortOrder: f.paintColors.length }] }))}>Add Row</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-2 py-2 font-medium">Area</th>
                  <th className="px-2 py-2 font-medium">Brand</th>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Color Name</th>
                  <th className="px-2 py-2 font-medium">Color Code</th>
                  <th className="px-2 py-2 font-medium">Finish</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {form.paintColors.map((color, index) => (
                  <tr key={index} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2"><input className="input" value={color.area} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, area: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.brand} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, brand: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.product} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, product: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.colorName} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, colorName: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.colorCode} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, colorCode: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.finish} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, finish: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><textarea className="input min-h-20" value={color.notes} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, notes: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, paintColors: f.paintColors.filter((_, i) => i !== index).map((item, sortOrder) => ({ ...item, sortOrder })) }))}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "attachments" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Attachments</h2>
            <div className="flex gap-2">
              <select className="input" value={selectedAttachmentCategory} onChange={(e) => setSelectedAttachmentCategory(e.target.value as (typeof ATTACHMENT_CATEGORIES)[number])} disabled={isReadOnly}>
                {ATTACHMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <button className="btn btn-secondary" disabled={isReadOnly} onClick={openAttachmentPicker}>Upload</button>
              <input ref={attachmentInputRef} type="file" className="hidden" onChange={onAttachmentSelected} />
            </div>
          </div>
          <div className="space-y-4">
            {form.attachments.length === 0 ? (
              <div className="text-sm text-slate-500">No attachments listed yet.</div>
            ) : (
              form.attachments.map((attachment, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-3 flex flex-wrap gap-3 items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">{attachment.category || "Other"}</div>
                    <div className="font-medium truncate">{attachment.fileName || "Untitled file"}</div>
                    {attachment.notes ? <div className="text-sm text-slate-600 mt-1">{attachment.notes}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary" disabled={!attachment.fileUrl} onClick={() => previewAttachment(attachment)}>Preview</button>
                    <a className={`btn btn-secondary ${!attachment.fileUrl ? "pointer-events-none opacity-50" : ""}`} href={attachment.fileUrl || "#"} download={attachment.fileName || "attachment"}>Download</a>
                    <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, i) => i !== index).map((item, sortOrder) => ({ ...item, sortOrder })) }))}>Delete</button>
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
          <div className="rounded-md border border-slate-200 p-6 space-y-6 text-sm bg-white">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">I.S. Painting Proposal</div>
              <div className="text-2xl font-semibold mt-1">{form.projectName || "Untitled Proposal"}</div>
              <div className="text-slate-600 mt-2">{proposal.proposalNumber} · {customerSearch || "Customer"}</div>
              <div className="text-slate-600">{[form.address, form.city, form.state, form.zipCode].filter(Boolean).join(", ") || "Address pending"}</div>
            </div>

            <div className="text-base text-slate-800 whitespace-pre-wrap">
              {greetingSection?.description || `Hi ${customerSearch || "there"},`}
            </div>

            <PreviewSection title="Project Summary" text={form.projectSummary} />

            <div>
              <h3 className="font-semibold mb-2">Proposal Sections</h3>
              {savedSectionsPreview.length === 0 ? (
                <p className="text-slate-500">No proposal sections added.</p>
              ) : (
                <div className="space-y-4">
                  {savedSectionsPreview
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((section, index) => (
                      <div key={`${section.title}-${index}`} className="border border-slate-100 rounded-md p-4">
                        <div className="font-semibold text-base mb-2">{section.title}</div>
                        {section.description ? <p className="text-slate-700 whitespace-pre-wrap mb-2">{section.description}</p> : null}
                        {section.bulletItems.filter((item) => item.trim().length > 0).length ? (
                          <ul className="list-disc ml-5 space-y-1 mb-2">
                            {section.bulletItems.filter((item) => item.trim().length > 0).map((item, bulletIndex) => <li key={bulletIndex}>{item}</li>)}
                          </ul>
                        ) : null}
                        {section.notes ? <p className="text-slate-600 whitespace-pre-wrap">{section.notes}</p> : null}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <PreviewSection title="Recommendations" text={form.recommendations} />
            <PreviewSection title="Important Notes" text={form.importantNotes} />

            <div>
              <h3 className="font-semibold mb-2">Options</h3>
              {savedOptionsPreview.length === 0 ? (
                <p className="text-slate-500">No options added.</p>
              ) : (
                <div className="space-y-2">
                  {savedOptionsPreview
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((o, idx) => (
                      <div key={`${o.title}-${idx}`} className="border border-slate-100 rounded-md p-3">
                        <div className="font-medium">{o.title || `Option ${idx + 1}`}</div>
                        <div className="text-slate-700">{o.description || "No description."}</div>
                        {o.isVisible ? <div className="text-xs uppercase tracking-wide text-brand-700 mt-1">Default Selected</div> : null}
                        <div className="font-semibold mt-1">{o.price.trim() ? formatCurrency(parseCurrencyValue(o.price) || 0) : "TBD"}</div>
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
                        <div className="text-slate-600">{[p.brand, p.product, p.colorCode, p.finish].filter(Boolean).join(" · ") || ""}</div>
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
              <h3 className="font-semibold mb-2">Final Investment</h3>
              <div className="grid md:grid-cols-2 gap-2">
                <div className="font-semibold">Total Proposal Price: {formatCurrency(form.totalAmount)}</div>
              </div>
              <div className="mt-3 grid md:grid-cols-2 gap-3">
                <PreviewSection title="Payment Schedule" text={form.paymentSchedule} />
                <PreviewSection title="Terms" text={form.termsAndConditions} />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Activity</h2>
          <div className="space-y-3">
            {activityItems.length === 0 ? (
              <div className="text-sm text-slate-500">No activity yet.</div>
            ) : (
              activityItems.map((item, index) => (
                <div key={`${item.label}-${index}`} className="border-l-2 border-slate-200 pl-4 py-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  {item.detail ? <div className="text-sm text-slate-600">{item.detail}</div> : null}
                  <div className="text-xs text-slate-500 mt-0.5">{formatDateTime(item.timestamp)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
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

function buildLegacySections(proposal: {
  scopeOfWork: string | null;
  includedWork: string | null;
  exclusions: string | null;
  recommendations: string | null;
  importantNotes: string | null;
  referencesText: string | null;
  closingText: string | null;
}) {
  const legacy = [
    ["scope_of_work", "Scope of Work", proposal.scopeOfWork],
    ["included_work", "Included Work", proposal.includedWork],
    ["excluded_work", "Excluded Work", proposal.exclusions],
    ["recommendations", "Recommendations", proposal.recommendations],
    ["important_notes", "Important Notes", proposal.importantNotes],
    ["references", "References", proposal.referencesText],
    ["closing", "Closing", proposal.closingText],
  ] as const;

  return legacy
    .filter(([, , value]) => (value || "").trim().length > 0)
    .map(([templateKey, title, value], sortOrder) => ({
      templateKey,
      title,
      description: value || "",
      bulletItems: [""],
      notes: "",
      sortOrder,
    }));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  currency,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  currency?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        className="input"
        value={currency ? formatCurrency(value) : String(value)}
        onChange={(e) => {
          const next = currency ? parseCurrencyValue(e.target.value) : Number(sanitizeNumericInput(e.target.value));
          onChange(Number.isFinite(next) ? next : 0);
        }}
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
