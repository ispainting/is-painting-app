"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Timeline } from "@/components/ui/Timeline";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { api } from "@/trpc/react";
import {
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  FileImage,
  FileText,
  Home,
  Mail,
  MessageSquare,
  NotebookPen,
  Phone,
  Receipt,
  Sparkles,
  Star,
  Target,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

type CustomerTab =
  | "overview"
  | "contact"
  | "properties"
  | "opportunities"
  | "proposals"
  | "jobs"
  | "invoices"
  | "payments"
  | "timeline"
  | "notes"
  | "documents"
  | "photos"
  | "automations"
  | "reviews"
  | "activity";

type ProfileDraft = {
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  source: string;
  leadSource: string;
  referralSource: string;
  status: string;
  preferredCommunication: string;
  notes: string;
  nextFollowUpAt: string;
  lastContactAt: string;
  tagsText: string;
  secondaryPhoneNumbers: Array<{ label?: string; number: string }>;
  secondaryEmails: Array<{ label?: string; email: string }>;
  properties: Array<{ label?: string; street?: string; city?: string; state?: string; zipCode?: string; notes?: string }>;
  emergencyContact: { name?: string; phone?: string; relationship?: string };
  colorPreferences: Array<{ area?: string; colorName: string; brand?: string; notes?: string }>;
  paintHistory: Array<{ area?: string; colorName: string; brand?: string; product?: string; date?: string; notes?: string }>;
  productHistory: Array<{ productName: string; brand?: string; colorName?: string; date?: string; notes?: string }>;
  warrantyHistory: Array<{ title: string; status?: string; startDate?: string; endDate?: string; notes?: string }>;
};

type NoteDraft = {
  subject: string;
  body: string;
  isPinned: boolean;
};

type FileDraft = {
  type: "attachment" | "photo";
  fileName: string;
  fileUrl: string;
  previewUrl: string;
  mimeType: string;
  category: string;
  notes: string;
};

const TABS: Array<{ id: CustomerTab; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Sparkles className="h-4 w-4" /> },
  { id: "contact", label: "Contact Info", icon: <Phone className="h-4 w-4" /> },
  { id: "properties", label: "Addresses / Properties", icon: <Home className="h-4 w-4" /> },
  { id: "opportunities", label: "Opportunities", icon: <Target className="h-4 w-4" /> },
  { id: "proposals", label: "Proposals", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "jobs", label: "Jobs", icon: <Wrench className="h-4 w-4" /> },
  { id: "invoices", label: "Invoices", icon: <Receipt className="h-4 w-4" /> },
  { id: "payments", label: "Payments", icon: <CreditCard className="h-4 w-4" /> },
  { id: "timeline", label: "Communication Timeline", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "notes", label: "Notes", icon: <NotebookPen className="h-4 w-4" /> },
  { id: "documents", label: "Documents", icon: <FileText className="h-4 w-4" /> },
  { id: "photos", label: "Photos", icon: <FileImage className="h-4 w-4" /> },
  { id: "automations", label: "Automations", icon: <BellRing className="h-4 w-4" /> },
  { id: "reviews", label: "Reviews", icon: <Star className="h-4 w-4" /> },
  { id: "activity", label: "Activity Log", icon: <Building2 className="h-4 w-4" /> },
];

const EMPTY_NOTE: NoteDraft = { subject: "", body: "", isPinned: false };
const EMPTY_FILE: FileDraft = { type: "attachment", fileName: "", fileUrl: "", previewUrl: "", mimeType: "", category: "", notes: "" };

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [activeTab, setActiveTab] = useState<CustomerTab>("overview");
  const [touchpointType, setTouchpointType] = useState<"call" | "email" | "sms" | "follow_up">("follow_up");
  const [touchpointSubject, setTouchpointSubject] = useState("");
  const [touchpointBody, setTouchpointBody] = useState("");
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(EMPTY_NOTE);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [fileDraft, setFileDraft] = useState<FileDraft>(EMPTY_FILE);

  const utils = api.useUtils();
  const profile = api.customers.profile.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 });

  const updateCustomer = api.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Customer profile updated");
      utils.customers.profile.invalidate({ id });
      utils.customers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const addTouchpoint = api.customers.addTouchpoint.useMutation({
    onSuccess: () => {
      toast.success("Touchpoint saved");
      setTouchpointSubject("");
      setTouchpointBody("");
      utils.customers.profile.invalidate({ id });
    },
    onError: (error) => toast.error(error.message),
  });

  const updateTouchpoint = api.customers.updateTouchpoint.useMutation({
    onSuccess: () => {
      toast.success("Note updated");
      setEditingNoteId(null);
      setNoteDraft(EMPTY_NOTE);
      utils.customers.profile.invalidate({ id });
    },
    onError: (error) => toast.error(error.message),
  });

  const pinTouchpoint = api.customers.pinTouchpoint.useMutation({
    onSuccess: () => utils.customers.profile.invalidate({ id }),
    onError: (error) => toast.error(error.message),
  });

  const deleteTouchpoint = api.customers.deleteTouchpoint.useMutation({
    onSuccess: () => {
      toast.success("Note removed");
      utils.customers.profile.invalidate({ id });
    },
    onError: (error) => toast.error(error.message),
  });

  const addFile = api.customers.addFile.useMutation({
    onSuccess: () => {
      toast.success("File added");
      setFileDraft(EMPTY_FILE);
      utils.customers.profile.invalidate({ id });
    },
    onError: (error) => toast.error(error.message),
  });

  const updateFile = api.customers.updateFile.useMutation({
    onSuccess: () => {
      toast.success("File updated");
      utils.customers.profile.invalidate({ id });
    },
    onError: (error) => toast.error(error.message),
  });

  const removeFile = api.customers.removeFile.useMutation({
    onSuccess: () => {
      toast.success("File removed");
      utils.customers.profile.invalidate({ id });
    },
    onError: (error) => toast.error(error.message),
  });

  const payload = profile.data as any;
  const customer = payload?.customer as any;

  useEffect(() => {
    if (!customer) return;
    setProfileDraft(buildProfileDraft(customer, payload.stats));
  }, [customer, payload?.stats]);

  const notes = useMemo(() => (customer?.touchpoints || []).filter((touchpoint: any) => touchpoint.type === "note"), [customer?.touchpoints]);
  const communicationTouchpoints = useMemo(
    () => (customer?.touchpoints || []).filter((touchpoint: any) => touchpoint.type !== "note"),
    [customer?.touchpoints],
  );
  const documents = useMemo(() => (customer?.files || []).filter((file: any) => file.type === "attachment"), [customer?.files]);
  const photos = useMemo(() => (customer?.files || []).filter((file: any) => file.type === "photo"), [customer?.files]);

  if (profile.isLoading || !profileDraft) {
    return (
      <div className="space-y-4">
        <PageHeader title="Customer Workspace" description="Loading customer CRM workspace" />
        <div className="card p-6 text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!payload || !customer) {
    return (
      <div className="space-y-4">
        <PageHeader title="Customer Workspace" description="Customer not found" />
        <div className="card p-6 text-sm text-slate-600">
          This customer record is unavailable.
          <div className="mt-3">
            <Link href="/customers" className="btn btn-primary">Back to Customers</Link>
          </div>
        </div>
      </div>
    );
  }

  function saveProfile() {
    if (!profileDraft) return;
    const draft = profileDraft;
    updateCustomer.mutate({
      id,
      data: {
        contactName: draft.contactName,
        email: draft.email,
        phone: draft.phone,
        address: draft.address,
        city: draft.city,
        state: draft.state,
        zipCode: draft.zipCode,
        source: draft.source,
        leadSource: draft.leadSource,
        referralSource: draft.referralSource,
        status: draft.status,
        preferredCommunication: draft.preferredCommunication,
        notes: draft.notes,
        tags: parseCommaList(draft.tagsText),
        secondaryPhoneNumbers: draft.secondaryPhoneNumbers.filter((item) => item.number.trim()),
        secondaryEmails: draft.secondaryEmails.filter((item) => item.email.trim()),
        properties: draft.properties.filter((item) => [item.label, item.street, item.city, item.state, item.zipCode, item.notes].some(Boolean)),
        emergencyContact: draft.emergencyContact,
        colorPreferences: draft.colorPreferences.filter((item) => item.colorName.trim()),
        paintHistory: draft.paintHistory.filter((item) => item.colorName.trim()),
        productHistory: draft.productHistory.filter((item) => item.productName.trim()),
        warrantyHistory: draft.warrantyHistory.filter((item) => item.title.trim()),
        lastContactAt: draft.lastContactAt ? new Date(draft.lastContactAt) : null,
        nextFollowUpAt: draft.nextFollowUpAt ? new Date(draft.nextFollowUpAt) : null,
      },
    });
  }

  function startEditNote(note: any) {
    setEditingNoteId(note.id);
    setActiveTab("notes");
    setNoteDraft({ subject: note.subject || "", body: note.body || "", isPinned: Boolean(note.isPinned) });
  }

  function saveNote() {
    if (!noteDraft.subject.trim() && !noteDraft.body.trim()) return toast.error("Add a title or note body.");
    if (editingNoteId) {
      updateTouchpoint.mutate({
        id: editingNoteId,
        data: {
          subject: noteDraft.subject,
          body: noteDraft.body,
          isPinned: noteDraft.isPinned,
        },
      });
      return;
    }
    addTouchpoint.mutate({
      customerId: id,
      type: "note",
      subject: noteDraft.subject,
      body: noteDraft.body,
      isPinned: noteDraft.isPinned,
    });
    setNoteDraft(EMPTY_NOTE);
  }

  function saveFile() {
    if (!fileDraft.fileName.trim()) return toast.error("File name is required.");
    addFile.mutate({
      customerId: id,
      type: fileDraft.type,
      fileName: fileDraft.fileName,
      fileUrl: fileDraft.fileUrl,
      previewUrl: fileDraft.previewUrl,
      mimeType: fileDraft.mimeType,
      category: fileDraft.category,
      notes: fileDraft.notes,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.name}
        description="Customer CRM workspace"
        actions={<Link href="/customers" className="btn btn-secondary">Back to Customers</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Lifetime Revenue" value={formatCurrency(payload.stats.lifetimeRevenue)} />
        <StatCard label="Total Profit" value={formatCurrency(payload.stats.totalProfit)} />
        <StatCard label="Avg Job Size" value={formatCurrency(payload.stats.averageJobSize)} />
        <StatCard label="Jobs Completed" value={String(payload.stats.jobsCompleted)} />
        <StatCard label="Win Rate" value={`${payload.stats.winRate}%`} />
        <StatCard label="Avg Payment Time" value={`${Math.round(payload.stats.averagePaymentTime || 0)} days`} />
        <StatCard label="Open Balance" value={formatCurrency(payload.stats.openBalance)} />
        <StatCard label="Active Jobs" value={String(payload.stats.activeJobs)} />
      </div>

      <div className="card p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "btn btn-primary whitespace-nowrap" : "btn btn-secondary whitespace-nowrap"}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="mr-1 inline-flex">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <SectionCard title="Account Snapshot">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Info label="Primary Contact" value={customer.contactName || "Not set"} />
                <Info label="Preferred Communication" value={customer.preferredCommunication || "Not set"} />
                <Info label="Lead Source" value={customer.leadSource || customer.source || "Not set"} />
                <Info label="Referral Source" value={customer.referralSource || "Not set"} />
                <Info label="Status" value={customer.status || "Not set"} />
                <Info label="Last Contact" value={formatDate(payload.stats.lastContactAt)} />
                <Info label="Next Follow-up" value={formatDate(payload.stats.nextFollowUpAt)} />
                <Info label="Primary Address" value={formatAddress(customer)} />
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(customer.tags || []).length ? (customer.tags || []).map((tag: string) => (
                    <span key={tag} className="badge bg-slate-100 text-slate-700">{tag}</span>
                  )) : <span className="text-sm text-slate-500">No tags yet</span>}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Preferences & History">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SimpleList title="Color Preferences" items={(customer.colorPreferences || []).map((item: any) => `${item.area || "Area"}: ${item.colorName}${item.brand ? ` · ${item.brand}` : ""}`)} empty="No color preferences saved" />
                <SimpleList title="Paint History" items={(customer.paintHistory || []).map((item: any) => `${item.area || "Area"}: ${item.colorName}${item.product ? ` · ${item.product}` : ""}`)} empty="No paint history saved" />
                <SimpleList title="Product History" items={(customer.productHistory || []).map((item: any) => `${item.productName}${item.brand ? ` · ${item.brand}` : ""}`)} empty="No product history saved" />
                <SimpleList title="Warranty History" items={(customer.warrantyHistory || []).map((item: any) => `${item.title}${item.status ? ` · ${item.status}` : ""}`)} empty="No warranty history saved" />
              </div>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="Next Actions">
              <p className="text-sm text-slate-600">
                {payload.stats.nextFollowUpAt
                  ? `Reach out by ${formatDate(payload.stats.nextFollowUpAt)} to keep this account moving.`
                  : "No follow-up date is scheduled. Set one in Contact Info so this account stays active."}
              </p>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div>Open opportunities: {customer.opportunities.length}</div>
                <div>Outstanding invoices: {customer.invoices.filter((invoice: any) => Number(invoice.amountRemaining) > 0).length}</div>
                <div>Documents on file: {documents.length}</div>
                <div>Photos on file: {photos.length}</div>
              </div>
            </SectionCard>

            <SectionCard title="Quick Touchpoint">
              <div className="space-y-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={touchpointType} onChange={(event) => setTouchpointType(event.target.value as any)}>
                    <option value="follow_up">Follow-up</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <Input label="Subject" value={touchpointSubject} onChange={setTouchpointSubject} />
                <div>
                  <label className="label">Details</label>
                  <textarea className="input min-h-[120px]" value={touchpointBody} onChange={(event) => setTouchpointBody(event.target.value)} />
                </div>
                <button
                  className="btn btn-primary w-full"
                  disabled={addTouchpoint.isPending || (!touchpointSubject.trim() && !touchpointBody.trim())}
                  onClick={() => addTouchpoint.mutate({ customerId: id, type: touchpointType, subject: touchpointSubject, body: touchpointBody })}
                >
                  {addTouchpoint.isPending ? "Saving…" : "Save touchpoint"}
                </button>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === "contact" ? (
        <div className="space-y-4">
          <SectionCard title="Contact Profile" action={<button className="btn btn-primary" onClick={saveProfile} disabled={updateCustomer.isPending}>{updateCustomer.isPending ? "Saving…" : "Save profile"}</button>}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Input label="Primary Contact" value={profileDraft.contactName} onChange={(value) => setProfileDraft({ ...profileDraft, contactName: value })} />
              <Input label="Primary Email" value={profileDraft.email} onChange={(value) => setProfileDraft({ ...profileDraft, email: value })} />
              <Input label="Primary Phone" value={profileDraft.phone} onChange={(value) => setProfileDraft({ ...profileDraft, phone: value })} />
              <Input label="Status" value={profileDraft.status} onChange={(value) => setProfileDraft({ ...profileDraft, status: value })} />
              <Input label="Lead Source" value={profileDraft.leadSource} onChange={(value) => setProfileDraft({ ...profileDraft, leadSource: value })} />
              <Input label="Referral Source" value={profileDraft.referralSource} onChange={(value) => setProfileDraft({ ...profileDraft, referralSource: value })} />
              <Input label="Preferred Communication" value={profileDraft.preferredCommunication} onChange={(value) => setProfileDraft({ ...profileDraft, preferredCommunication: value })} />
              <Input label="Last Contact" type="date" value={profileDraft.lastContactAt} onChange={(value) => setProfileDraft({ ...profileDraft, lastContactAt: value })} />
              <Input label="Next Follow-up" type="date" value={profileDraft.nextFollowUpAt} onChange={(value) => setProfileDraft({ ...profileDraft, nextFollowUpAt: value })} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <EditableArray
                title="Additional Phone Numbers"
                items={profileDraft.secondaryPhoneNumbers}
                onAdd={() => setProfileDraft({ ...profileDraft, secondaryPhoneNumbers: [...profileDraft.secondaryPhoneNumbers, { label: "", number: "" }] })}
                renderItem={(item, index) => (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input label="Label" value={item.label || ""} onChange={(value) => updateArray(profileDraft.secondaryPhoneNumbers, index, { ...item, label: value }, (next) => setProfileDraft({ ...profileDraft, secondaryPhoneNumbers: next }))} />
                    <Input label="Number" value={item.number || ""} onChange={(value) => updateArray(profileDraft.secondaryPhoneNumbers, index, { ...item, number: value }, (next) => setProfileDraft({ ...profileDraft, secondaryPhoneNumbers: next }))} />
                    <div className="flex items-end">
                      <button className="btn btn-secondary w-full" onClick={() => removeArray(profileDraft.secondaryPhoneNumbers, index, (next) => setProfileDraft({ ...profileDraft, secondaryPhoneNumbers: next }))}>Remove</button>
                    </div>
                  </div>
                )}
              />
              <EditableArray
                title="Additional Emails"
                items={profileDraft.secondaryEmails}
                onAdd={() => setProfileDraft({ ...profileDraft, secondaryEmails: [...profileDraft.secondaryEmails, { label: "", email: "" }] })}
                renderItem={(item, index) => (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input label="Label" value={item.label || ""} onChange={(value) => updateArray(profileDraft.secondaryEmails, index, { ...item, label: value }, (next) => setProfileDraft({ ...profileDraft, secondaryEmails: next }))} />
                    <Input label="Email" value={item.email || ""} onChange={(value) => updateArray(profileDraft.secondaryEmails, index, { ...item, email: value }, (next) => setProfileDraft({ ...profileDraft, secondaryEmails: next }))} />
                    <div className="flex items-end">
                      <button className="btn btn-secondary w-full" onClick={() => removeArray(profileDraft.secondaryEmails, index, (next) => setProfileDraft({ ...profileDraft, secondaryEmails: next }))}>Remove</button>
                    </div>
                  </div>
                )}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <SectionBox title="Emergency Contact">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Input label="Name" value={profileDraft.emergencyContact.name || ""} onChange={(value) => setProfileDraft({ ...profileDraft, emergencyContact: { ...profileDraft.emergencyContact, name: value } })} />
                  <Input label="Phone" value={profileDraft.emergencyContact.phone || ""} onChange={(value) => setProfileDraft({ ...profileDraft, emergencyContact: { ...profileDraft.emergencyContact, phone: value } })} />
                  <Input label="Relationship" value={profileDraft.emergencyContact.relationship || ""} onChange={(value) => setProfileDraft({ ...profileDraft, emergencyContact: { ...profileDraft.emergencyContact, relationship: value } })} />
                </div>
              </SectionBox>
              <SectionBox title="Tags & Internal Notes">
                <Input label="Tags" value={profileDraft.tagsText} onChange={(value) => setProfileDraft({ ...profileDraft, tagsText: value })} placeholder="vip, repeat, warranty" />
                <div className="mt-3">
                  <label className="label">Internal Notes</label>
                  <textarea className="input min-h-[120px]" value={profileDraft.notes} onChange={(event) => setProfileDraft({ ...profileDraft, notes: event.target.value })} />
                </div>
              </SectionBox>
            </div>
          </SectionCard>

          <SectionCard title="Color & Product History" action={<button className="btn btn-secondary" onClick={saveProfile}>Save history</button>}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ArrayEditor
                title="Color Preferences"
                items={profileDraft.colorPreferences}
                onAdd={() => setProfileDraft({ ...profileDraft, colorPreferences: [...profileDraft.colorPreferences, { area: "", colorName: "", brand: "", notes: "" }] })}
                render={(item, index) => (
                  <HistoryEditor
                    fields={[
                      { label: "Area", value: item.area || "", onChange: (value) => updateHistory(profileDraft.colorPreferences, index, { ...item, area: value }, (next) => setProfileDraft({ ...profileDraft, colorPreferences: next })) },
                      { label: "Color", value: item.colorName || "", onChange: (value) => updateHistory(profileDraft.colorPreferences, index, { ...item, colorName: value }, (next) => setProfileDraft({ ...profileDraft, colorPreferences: next })) },
                      { label: "Brand", value: item.brand || "", onChange: (value) => updateHistory(profileDraft.colorPreferences, index, { ...item, brand: value }, (next) => setProfileDraft({ ...profileDraft, colorPreferences: next })) },
                      { label: "Notes", value: item.notes || "", onChange: (value) => updateHistory(profileDraft.colorPreferences, index, { ...item, notes: value }, (next) => setProfileDraft({ ...profileDraft, colorPreferences: next })) },
                    ]}
                    onRemove={() => removeArray(profileDraft.colorPreferences, index, (next) => setProfileDraft({ ...profileDraft, colorPreferences: next }))}
                  />
                )}
              />
              <ArrayEditor
                title="Paint History"
                items={profileDraft.paintHistory}
                onAdd={() => setProfileDraft({ ...profileDraft, paintHistory: [...profileDraft.paintHistory, { area: "", colorName: "", brand: "", product: "", date: "", notes: "" }] })}
                render={(item, index) => (
                  <HistoryEditor
                    fields={[
                      { label: "Area", value: item.area || "", onChange: (value) => updateHistory(profileDraft.paintHistory, index, { ...item, area: value }, (next) => setProfileDraft({ ...profileDraft, paintHistory: next })) },
                      { label: "Color", value: item.colorName || "", onChange: (value) => updateHistory(profileDraft.paintHistory, index, { ...item, colorName: value }, (next) => setProfileDraft({ ...profileDraft, paintHistory: next })) },
                      { label: "Brand", value: item.brand || "", onChange: (value) => updateHistory(profileDraft.paintHistory, index, { ...item, brand: value }, (next) => setProfileDraft({ ...profileDraft, paintHistory: next })) },
                      { label: "Product", value: item.product || "", onChange: (value) => updateHistory(profileDraft.paintHistory, index, { ...item, product: value }, (next) => setProfileDraft({ ...profileDraft, paintHistory: next })) },
                      { label: "Date", value: item.date || "", onChange: (value) => updateHistory(profileDraft.paintHistory, index, { ...item, date: value }, (next) => setProfileDraft({ ...profileDraft, paintHistory: next })) },
                      { label: "Notes", value: item.notes || "", onChange: (value) => updateHistory(profileDraft.paintHistory, index, { ...item, notes: value }, (next) => setProfileDraft({ ...profileDraft, paintHistory: next })) },
                    ]}
                    onRemove={() => removeArray(profileDraft.paintHistory, index, (next) => setProfileDraft({ ...profileDraft, paintHistory: next }))}
                  />
                )}
              />
              <ArrayEditor
                title="Product History"
                items={profileDraft.productHistory}
                onAdd={() => setProfileDraft({ ...profileDraft, productHistory: [...profileDraft.productHistory, { productName: "", brand: "", colorName: "", date: "", notes: "" }] })}
                render={(item, index) => (
                  <HistoryEditor
                    fields={[
                      { label: "Product", value: item.productName || "", onChange: (value) => updateHistory(profileDraft.productHistory, index, { ...item, productName: value }, (next) => setProfileDraft({ ...profileDraft, productHistory: next })) },
                      { label: "Brand", value: item.brand || "", onChange: (value) => updateHistory(profileDraft.productHistory, index, { ...item, brand: value }, (next) => setProfileDraft({ ...profileDraft, productHistory: next })) },
                      { label: "Color", value: item.colorName || "", onChange: (value) => updateHistory(profileDraft.productHistory, index, { ...item, colorName: value }, (next) => setProfileDraft({ ...profileDraft, productHistory: next })) },
                      { label: "Date", value: item.date || "", onChange: (value) => updateHistory(profileDraft.productHistory, index, { ...item, date: value }, (next) => setProfileDraft({ ...profileDraft, productHistory: next })) },
                      { label: "Notes", value: item.notes || "", onChange: (value) => updateHistory(profileDraft.productHistory, index, { ...item, notes: value }, (next) => setProfileDraft({ ...profileDraft, productHistory: next })) },
                    ]}
                    onRemove={() => removeArray(profileDraft.productHistory, index, (next) => setProfileDraft({ ...profileDraft, productHistory: next }))}
                  />
                )}
              />
              <ArrayEditor
                title="Warranty History"
                items={profileDraft.warrantyHistory}
                onAdd={() => setProfileDraft({ ...profileDraft, warrantyHistory: [...profileDraft.warrantyHistory, { title: "", status: "", startDate: "", endDate: "", notes: "" }] })}
                render={(item, index) => (
                  <HistoryEditor
                    fields={[
                      { label: "Title", value: item.title || "", onChange: (value) => updateHistory(profileDraft.warrantyHistory, index, { ...item, title: value }, (next) => setProfileDraft({ ...profileDraft, warrantyHistory: next })) },
                      { label: "Status", value: item.status || "", onChange: (value) => updateHistory(profileDraft.warrantyHistory, index, { ...item, status: value }, (next) => setProfileDraft({ ...profileDraft, warrantyHistory: next })) },
                      { label: "Start Date", value: item.startDate || "", onChange: (value) => updateHistory(profileDraft.warrantyHistory, index, { ...item, startDate: value }, (next) => setProfileDraft({ ...profileDraft, warrantyHistory: next })) },
                      { label: "End Date", value: item.endDate || "", onChange: (value) => updateHistory(profileDraft.warrantyHistory, index, { ...item, endDate: value }, (next) => setProfileDraft({ ...profileDraft, warrantyHistory: next })) },
                      { label: "Notes", value: item.notes || "", onChange: (value) => updateHistory(profileDraft.warrantyHistory, index, { ...item, notes: value }, (next) => setProfileDraft({ ...profileDraft, warrantyHistory: next })) },
                    ]}
                    onRemove={() => removeArray(profileDraft.warrantyHistory, index, (next) => setProfileDraft({ ...profileDraft, warrantyHistory: next }))}
                  />
                )}
              />
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "properties" ? (
        <SectionCard title="Addresses & Properties" action={<button className="btn btn-primary" onClick={saveProfile}>Save properties</button>}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionBox title="Primary Address">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input label="Street" value={profileDraft.address} onChange={(value) => setProfileDraft({ ...profileDraft, address: value })} />
                <Input label="City" value={profileDraft.city} onChange={(value) => setProfileDraft({ ...profileDraft, city: value })} />
                <Input label="State" value={profileDraft.state} onChange={(value) => setProfileDraft({ ...profileDraft, state: value })} />
                <Input label="Zip Code" value={profileDraft.zipCode} onChange={(value) => setProfileDraft({ ...profileDraft, zipCode: value })} />
              </div>
            </SectionBox>
            <EditableArray
              title="Additional Properties"
              items={profileDraft.properties}
              onAdd={() => setProfileDraft({ ...profileDraft, properties: [...profileDraft.properties, { label: "", street: "", city: "", state: "", zipCode: "", notes: "" }] })}
              renderItem={(item, index) => (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input label="Label" value={item.label || ""} onChange={(value) => updateArray(profileDraft.properties, index, { ...item, label: value }, (next) => setProfileDraft({ ...profileDraft, properties: next }))} />
                    <Input label="Street" value={item.street || ""} onChange={(value) => updateArray(profileDraft.properties, index, { ...item, street: value }, (next) => setProfileDraft({ ...profileDraft, properties: next }))} />
                    <Input label="City" value={item.city || ""} onChange={(value) => updateArray(profileDraft.properties, index, { ...item, city: value }, (next) => setProfileDraft({ ...profileDraft, properties: next }))} />
                    <Input label="State" value={item.state || ""} onChange={(value) => updateArray(profileDraft.properties, index, { ...item, state: value }, (next) => setProfileDraft({ ...profileDraft, properties: next }))} />
                    <Input label="Zip Code" value={item.zipCode || ""} onChange={(value) => updateArray(profileDraft.properties, index, { ...item, zipCode: value }, (next) => setProfileDraft({ ...profileDraft, properties: next }))} />
                  </div>
                  <div>
                    <label className="label">Notes</label>
                    <textarea className="input min-h-[100px]" value={item.notes || ""} onChange={(event) => updateArray(profileDraft.properties, index, { ...item, notes: event.target.value }, (next) => setProfileDraft({ ...profileDraft, properties: next }))} />
                  </div>
                  <button className="btn btn-secondary" onClick={() => removeArray(profileDraft.properties, index, (next) => setProfileDraft({ ...profileDraft, properties: next }))}>Remove property</button>
                </div>
              )}
            />
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "opportunities" ? <PipelineCards opportunities={customer.opportunities || []} /> : null}
      {activeTab === "proposals" ? <ProposalTable proposals={customer.proposals || []} /> : null}
      {activeTab === "jobs" ? <JobTable jobs={customer.jobs || []} /> : null}
      {activeTab === "invoices" ? <InvoiceTable invoices={customer.invoices || []} /> : null}
      {activeTab === "payments" ? <PaymentTable payments={payload.payments || []} /> : null}

      {activeTab === "timeline" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Timeline
              items={payload.timeline}
              emptyTitle="No timeline events yet"
              emptyDescription="Calls, emails, SMS, proposals, jobs, payments, documents, and photos will appear here as this customer moves through the lifecycle."
            />
          </div>
          <SectionCard title="Communication Log">
            <div className="space-y-3">
              {communicationTouchpoints.length ? communicationTouchpoints.map((touchpoint: any) => (
                <div key={touchpoint.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 capitalize">{touchpoint.type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(touchpoint.occurredAt)}</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{touchpoint.subject || "No subject"}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{touchpoint.body || "No details logged."}</p>
                </div>
              )) : <EmptyState text="No calls, emails, or SMS touchpoints logged yet." />}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "notes" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SectionCard title="Customer Notes">
              <div className="space-y-4">
                {notes.length ? notes.map((note: any) => (
                  <div key={note.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-slate-900">{note.subject || "Untitled note"}</div>
                          {note.isPinned ? <span className="badge bg-amber-100 text-amber-800">Pinned</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(note.occurredAt)} {note.createdBy?.name ? `• ${note.createdBy.name}` : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="btn btn-secondary text-xs" onClick={() => pinTouchpoint.mutate({ id: note.id, pinned: !note.isPinned })}>{note.isPinned ? "Unpin" : "Pin"}</button>
                        <button className="btn btn-secondary text-xs" onClick={() => startEditNote(note)}>Edit</button>
                        <button className="btn btn-secondary text-xs" onClick={() => deleteTouchpoint.mutate({ id: note.id })}>Delete</button>
                      </div>
                    </div>
                    <RichTextPreview value={note.body || ""} />
                  </div>
                )) : <EmptyState text="No notes yet. Capture customer context, color details, warranty promises, and next steps here." />}
              </div>
            </SectionCard>
          </div>

          <SectionCard title={editingNoteId ? "Edit Note" : "New Note"}>
            <div className="space-y-3">
              <Input label="Title" value={noteDraft.subject} onChange={(value) => setNoteDraft({ ...noteDraft, subject: value })} />
              <RichTextEditor value={noteDraft.body} onChange={(value) => setNoteDraft({ ...noteDraft, body: value })} />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={noteDraft.isPinned} onChange={(event) => setNoteDraft({ ...noteDraft, isPinned: event.target.checked })} />
                Pin important note
              </label>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={saveNote} disabled={addTouchpoint.isPending || updateTouchpoint.isPending}>
                  {editingNoteId ? (updateTouchpoint.isPending ? "Saving…" : "Update note") : (addTouchpoint.isPending ? "Saving…" : "Save note")}
                </button>
                {editingNoteId ? <button className="btn btn-secondary" onClick={() => { setEditingNoteId(null); setNoteDraft(EMPTY_NOTE); }}>Cancel</button> : null}
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "documents" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SectionCard title="Documents">
              <div className="space-y-3">
                {documents.length ? documents.map((file: any) => (
                  <FileCard key={file.id} file={file} onRemove={() => removeFile.mutate({ id: file.id })} onCategoryChange={(category) => updateFile.mutate({ id: file.id, data: { category } })} />
                )) : <EmptyState text="No documents uploaded yet." />}
              </div>
            </SectionCard>
          </div>
          <SectionCard title="Upload Document">
            <FileEditor draft={fileDraft} setDraft={setFileDraft} fileType="attachment" onSave={saveFile} pending={addFile.isPending} />
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "photos" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SectionCard title="Photos">
              {photos.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {photos.map((file: any) => (
                    <div key={file.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
                        {file.previewUrl || file.fileUrl ? (
                          <img src={file.previewUrl || file.fileUrl} alt={file.fileName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-slate-500">No preview</div>
                        )}
                      </div>
                      <div className="mt-3 font-medium text-slate-900">{file.fileName}</div>
                      <div className="mt-1 text-xs text-slate-500">{file.category || "Uncategorized"}</div>
                      {file.notes ? <div className="mt-1 text-sm text-slate-600">{file.notes}</div> : null}
                      <div className="mt-3 flex gap-2">
                        {file.fileUrl ? <a className="btn btn-secondary text-xs" href={file.fileUrl} target="_blank" rel="noreferrer">Open</a> : null}
                        <button className="btn btn-secondary text-xs" onClick={() => removeFile.mutate({ id: file.id })}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="No customer photos uploaded yet." />}
            </SectionCard>
          </div>
          <SectionCard title="Upload Photo">
            <FileEditor draft={fileDraft} setDraft={setFileDraft} fileType="photo" onSave={saveFile} pending={addFile.isPending} />
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "automations" ? (
        <SectionCard title="Automation Runs">
          <div className="space-y-3">
            {(payload.automations || []).length ? payload.automations.map((run: any) => (
              <div key={run.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{run.template.displayName}</div>
                    <div className="text-sm text-slate-500">Opportunity: {run.opportunity.name}</div>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <div className="capitalize">{run.status}</div>
                    <div>Next action: {formatDateTime(run.nextActionAt)}</div>
                  </div>
                </div>
              </div>
            )) : <EmptyState text="No automation runs are connected to this customer yet." />}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "reviews" ? (
        <SectionCard title="Reviews">
          <div className="space-y-3">
            {(customer.reviewSubmissions || []).length ? customer.reviewSubmissions.map((review: any) => (
              <div key={review.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{review.submittedAt ? `${review.rating}/5 stars` : "Review request pending"}</div>
                    <div className="text-xs text-slate-500">Created {formatDateTime(review.createdAt)}</div>
                  </div>
                  <div className="text-xs text-slate-500">{review.submittedAt ? `Submitted ${formatDateTime(review.submittedAt)}` : "Awaiting response"}</div>
                </div>
                {review.feedback ? <p className="mt-2 text-sm text-slate-600">{review.feedback}</p> : null}
              </div>
            )) : <EmptyState text="No review requests have been sent for this customer." />}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "activity" ? (
        <SectionCard title="Activity Log">
          <div className="space-y-3">
            {(payload.activityLog || []).length ? payload.activityLog.map((entry: any) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{entry.action.replace(/\./g, " ")}</div>
                    <div className="text-xs text-slate-500">{entry.actor} • {formatDateTime(entry.at)}</div>
                  </div>
                </div>
                {entry.after ? <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(entry.after, null, 2)}</pre> : null}
              </div>
            )) : <EmptyState text="No customer-specific activity has been recorded yet." />}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function buildProfileDraft(customer: any, stats: any): ProfileDraft {
  return {
    contactName: customer.contactName || "",
    email: customer.email || "",
    phone: customer.phone || "",
    address: customer.address || "",
    city: customer.city || "",
    state: customer.state || "",
    zipCode: customer.zipCode || "",
    source: customer.source || "",
    leadSource: customer.leadSource || "",
    referralSource: customer.referralSource || "",
    status: customer.status || "",
    preferredCommunication: customer.preferredCommunication || "",
    notes: customer.notes || "",
    nextFollowUpAt: toInputDate(stats?.nextFollowUpAt),
    lastContactAt: toInputDate(stats?.lastContactAt),
    tagsText: (customer.tags || []).join(", "),
    secondaryPhoneNumbers: customer.secondaryPhoneNumbers || [],
    secondaryEmails: customer.secondaryEmails || [],
    properties: customer.properties || [],
    emergencyContact: customer.emergencyContact || { name: "", phone: "", relationship: "" },
    colorPreferences: customer.colorPreferences || [],
    paintHistory: customer.paintHistory || [],
    productHistory: customer.productHistory || [],
    warrantyHistory: customer.warrantyHistory || [],
  };
}

function toInputDate(value?: Date | string | null) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseCommaList(value: string) {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function formatAddress(customer: any) {
  return [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ") || "Not set";
}

function updateArray<T>(items: T[], index: number, value: T, commit: (next: T[]) => void) {
  const next = items.slice();
  next[index] = value;
  commit(next);
}

function removeArray<T>(items: T[], index: number, commit: (next: T[]) => void) {
  commit(items.filter((_, itemIndex) => itemIndex !== index));
}

function updateHistory<T>(items: T[], index: number, value: T, commit: (next: T[]) => void) {
  updateArray(items, index, value, commit);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">{title}</div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{value}</div>
    </div>
  );
}

function SimpleList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => <div key={item} className="text-sm text-slate-600">{item}</div>) : <div className="text-sm text-slate-500">{empty}</div>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">{text}</div>;
}

function EditableArray({
  title,
  items,
  onAdd,
  renderItem,
}: {
  title: string;
  items: any[];
  onAdd: () => void;
  renderItem: (item: any, index: number) => ReactNode;
}) {
  return (
    <SectionBox title={title}>
      <div className="space-y-3">
        {items.length ? items.map((item, index) => <div key={`${title}-${index}`}>{renderItem(item, index)}</div>) : <div className="text-sm text-slate-500">No entries yet.</div>}
        <button className="btn btn-secondary" onClick={onAdd}>Add</button>
      </div>
    </SectionBox>
  );
}

function ArrayEditor({ title, items, onAdd, render }: { title: string; items: any[]; onAdd: () => void; render: (item: any, index: number) => ReactNode }) {
  return (
    <SectionBox title={title}>
      <div className="space-y-3">
        {items.length ? items.map((item, index) => <div key={`${title}-${index}`}>{render(item, index)}</div>) : <div className="text-sm text-slate-500">No history entries yet.</div>}
        <button className="btn btn-secondary" onClick={onAdd}>Add entry</button>
      </div>
    </SectionBox>
  );
}

function HistoryEditor({ fields, onRemove }: { fields: Array<{ label: string; value: string; onChange: (value: string) => void }>; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <Input key={field.label} label={field.label} value={field.value} onChange={field.onChange} />
        ))}
      </div>
      <button className="btn btn-secondary mt-3" onClick={onRemove}>Remove</button>
    </div>
  );
}

function ProposalTable({ proposals }: { proposals: any[] }) {
  return (
    <SectionCard title="Proposals">
      <DataTable
        headers={["Number", "Project", "Status", "Amount", "Created", "Action"]}
        rows={proposals.map((proposal) => [
          proposal.proposalNumber,
          proposal.projectName,
          proposal.status,
          formatCurrency(proposal.totalAmount),
          formatDate(proposal.createdAt),
          <Link key={proposal.id} href={`/proposals/${proposal.id}`} className="text-brand-700 hover:underline">Open</Link>,
        ])}
        empty="No proposals linked to this customer yet."
      />
    </SectionCard>
  );
}

function JobTable({ jobs }: { jobs: any[] }) {
  return (
    <SectionCard title="Jobs">
      <DataTable
        headers={["Estimate", "Job", "Status", "Value", "Start", "Action"]}
        rows={jobs.map((job) => [
          job.estimateNumber,
          job.name,
          job.status,
          formatCurrency(Number(job.contractAmount || job.totalEstimate || 0)),
          formatDate(job.startDate || job.createdAt),
          <Link key={job.id} href={`/jobs/${job.id}`} className="text-brand-700 hover:underline">Open</Link>,
        ])}
        empty="No jobs linked to this customer yet."
      />
    </SectionCard>
  );
}

function InvoiceTable({ invoices }: { invoices: any[] }) {
  return (
    <SectionCard title="Invoices">
      <DataTable
        headers={["Number", "Title", "Status", "Total", "Remaining", "Sent"]}
        rows={invoices.map((invoice) => [
          invoice.invoiceNumber,
          invoice.title,
          invoice.status,
          formatCurrency(invoice.total),
          formatCurrency(invoice.amountRemaining),
          formatDate(invoice.sentAt || invoice.createdAt),
        ])}
        empty="No invoices linked to this customer yet."
      />
    </SectionCard>
  );
}

function PaymentTable({ payments }: { payments: any[] }) {
  return (
    <SectionCard title="Payments">
      <DataTable
        headers={["Date", "Job", "Invoice", "Method", "Amount", "Status"]}
        rows={payments.map((payment) => [
          formatDate(payment.dateReceived),
          payment.job?.name || "—",
          payment.invoice?.invoiceNumber || "—",
          payment.method.replace(/_/g, " "),
          formatCurrency(payment.amount),
          payment.status,
        ])}
        empty="No payments recorded yet."
      />
    </SectionCard>
  );
}

function PipelineCards({ opportunities }: { opportunities: any[] }) {
  return (
    <SectionCard title="Opportunities">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {opportunities.length ? opportunities.map((opportunity) => (
          <div key={opportunity.id} className="rounded-xl border border-slate-200 p-4">
            <div className="font-semibold text-slate-900">{opportunity.name}</div>
            <div className="mt-1 text-sm text-slate-500">{opportunity.stage.replace(/_/g, " ")} • {opportunity.status}</div>
            <div className="mt-3 text-sm text-slate-600">Lead value: {formatCurrency(opportunity.leadValue)}</div>
            <div className="text-sm text-slate-600">Assigned to: {opportunity.assignedTo?.name || "Unassigned"}</div>
            <div className="mt-2 text-xs text-slate-500">Created {formatDate(opportunity.createdAt)}</div>
          </div>
        )) : <EmptyState text="No opportunities linked to this customer yet." />}
      </div>
    </SectionCard>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-slate-100">
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-2">{cell}</td>)}
            </tr>
          )) : (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={headers.length}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  function insert(token: string) {
    onChange(`${value}${value ? "\n" : ""}${token}`);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary text-xs" onClick={() => insert("**Bold text**")}>Bold</button>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => insert("*Italic text*")}>Italic</button>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => insert("- Bullet item")}>Bullet</button>
        <button type="button" className="btn btn-secondary text-xs" onClick={() => insert("`Reference`")}>Code</button>
      </div>
      <textarea className="input min-h-[180px]" value={value} onChange={(event) => onChange(event.target.value)} />
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>
        <RichTextPreview value={value} />
      </div>
    </div>
  );
}

function RichTextPreview({ value }: { value: string }) {
  if (!value.trim()) return <div className="text-sm text-slate-500">No content yet.</div>;
  return <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: renderRichText(value) }} />;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderRichText(value: string) {
  const escaped = escapeHtml(value);
  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  return html
    .split("\n")
    .map((line) => {
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      return `<p>${line || "&nbsp;"}</p>`;
    })
    .join("")
    .replace(/(<li>.*<\/li>)/g, "<ul>$1</ul>");
}

function FileEditor({ draft, setDraft, fileType, onSave, pending }: { draft: FileDraft; setDraft: (draft: FileDraft) => void; fileType: "attachment" | "photo"; onSave: () => void; pending: boolean }) {
  useEffect(() => {
    if (draft.type !== fileType) setDraft({ ...draft, type: fileType });
  }, [draft, fileType, setDraft]);

  return (
    <div className="space-y-3">
      <Input label="File Name" value={draft.fileName} onChange={(value) => setDraft({ ...draft, fileName: value, type: fileType })} />
      <Input label="File URL" value={draft.fileUrl} onChange={(value) => setDraft({ ...draft, fileUrl: value, type: fileType })} />
      <Input label="Preview URL" value={draft.previewUrl} onChange={(value) => setDraft({ ...draft, previewUrl: value, type: fileType })} />
      <Input label="Category" value={draft.category} onChange={(value) => setDraft({ ...draft, category: value, type: fileType })} />
      <Input label="Mime Type" value={draft.mimeType} onChange={(value) => setDraft({ ...draft, mimeType: value, type: fileType })} />
      <div>
        <label className="label">Notes</label>
        <textarea className="input min-h-[120px]" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value, type: fileType })} />
      </div>
      <button className="btn btn-primary w-full" onClick={onSave} disabled={pending || !draft.fileName.trim()}>
        {pending ? "Saving…" : fileType === "photo" ? "Upload photo" : "Upload document"}
      </button>
    </div>
  );
}

function FileCard({ file, onRemove, onCategoryChange }: { file: any; onRemove: () => void; onCategoryChange: (category: string) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{file.fileName}</div>
          <div className="text-xs text-slate-500">Added {formatDateTime(file.createdAt)}</div>
        </div>
        <button className="btn btn-secondary text-xs" onClick={onRemove}>Delete</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="label">Category</label>
          <input className="input" value={file.category || ""} onChange={(event) => onCategoryChange(event.target.value)} />
        </div>
        <div>
          <label className="label">Preview</label>
          {file.previewUrl || file.fileUrl ? <a href={file.previewUrl || file.fileUrl} className="btn btn-secondary w-full" target="_blank" rel="noreferrer">Open Preview</a> : <div className="input flex items-center text-sm text-slate-400">No preview URL</div>}
        </div>
        <div>
          <label className="label">Download</label>
          {file.fileUrl ? <a href={file.fileUrl} className="btn btn-secondary w-full" target="_blank" rel="noreferrer" download>Download</a> : <div className="input flex items-center text-sm text-slate-400">No file URL</div>}
        </div>
      </div>
      {file.notes ? <div className="mt-3 text-sm text-slate-600">{file.notes}</div> : null}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
