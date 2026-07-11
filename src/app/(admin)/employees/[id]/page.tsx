"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Timeline } from "@/components/ui/Timeline";
import { api } from "@/trpc/react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

type EmployeeTab =
  | "overview"
  | "payroll"
  | "time-history"
  | "assigned-jobs"
  | "certifications"
  | "documents"
  | "performance"
  | "notes"
  | "activity";

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const utils = api.useUtils();

  const [tab, setTab] = useState<EmployeeTab>("overview");
  const [startDate, setStartDate] = useState(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const workspace = api.employees.byIdWorkspace.useQuery({
    id,
    startDate: new Date(`${startDate}T00:00:00`),
    endDate: new Date(`${endDate}T23:59:59`),
  });

  const [profileForm, setProfileForm] = useState({
    name: "",
    employeeRole: "",
    phone: "",
    email: "",
    address: "",
    profilePhotoUrl: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    hireDate: "",
    employeeCode: "",
    skillsText: "",
    languagesText: "",
    isActive: true,
  });

  const [payrollForm, setPayrollForm] = useState({
    hourlyRate: 0,
    specialJobAdjustment: 0,
    overtimeMultiplier: 1.5,
    overtimeRate: "",
    travelPayEnabled: false,
    defaultTravelHours: 0,
    travelRateType: "regular" as "regular" | "special" | "custom",
    customTravelRate: "",
    payrollNotes: "",
    regularHours: 32,
    specialHours: 4,
    travelHours: 2,
    overtimeHours: 8,
  });

  const [certForm, setCertForm] = useState({
    name: "",
    issuingAuthority: "",
    issueDate: "",
    expirationDate: "",
    reminderDays: 30,
    status: "active" as "active" | "expiring_soon" | "expired",
    notes: "",
  });

  const [docForm, setDocForm] = useState({
    type: "custom" as "driver_license" | "osha_card" | "contract" | "w9" | "i9" | "insurance" | "custom",
    title: "",
    fileName: "",
    fileUrl: "",
    mimeType: "",
    notes: "",
  });

  const [note, setNote] = useState("");

  const updateProfile = api.employees.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Overview saved");
      utils.employees.byIdWorkspace.invalidate({ id, startDate: new Date(`${startDate}T00:00:00`), endDate: new Date(`${endDate}T23:59:59`) });
    },
    onError: (error) => toast.error(error.message),
  });

  const updatePayroll = api.employees.updatePayroll.useMutation({
    onSuccess: () => {
      toast.success("Payroll saved");
      workspace.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const addCertification = api.employees.addCertification.useMutation({
    onSuccess: () => {
      toast.success("Certification added");
      workspace.refetch();
      setCertForm({ name: "", issuingAuthority: "", issueDate: "", expirationDate: "", reminderDays: 30, status: "active", notes: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const removeCertification = api.employees.removeCertification.useMutation({
    onSuccess: () => {
      toast.success("Certification removed");
      workspace.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const addDocument = api.employees.addDocument.useMutation({
    onSuccess: () => {
      toast.success("Document added");
      workspace.refetch();
      setDocForm({ type: "custom", title: "", fileName: "", fileUrl: "", mimeType: "", notes: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const removeDocument = api.employees.removeDocument.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      workspace.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const addNote = api.employees.addNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      workspace.refetch();
      setNote("");
    },
    onError: (error) => toast.error(error.message),
  });

  const preview = api.employees.payrollPreview.useQuery(
    {
      hourlyRate: payrollForm.hourlyRate,
      specialJobAdjustment: payrollForm.specialJobAdjustment,
      overtimeMultiplier: payrollForm.overtimeMultiplier,
      overtimeRate: payrollForm.overtimeRate ? Number(payrollForm.overtimeRate) : null,
      travelPayEnabled: payrollForm.travelPayEnabled,
      defaultTravelHours: payrollForm.defaultTravelHours,
      travelRateType: payrollForm.travelRateType,
      customTravelRate: payrollForm.customTravelRate ? Number(payrollForm.customTravelRate) : null,
      payrollNotes: payrollForm.payrollNotes,
      regularHours: payrollForm.regularHours,
      specialHours: payrollForm.specialHours,
      travelHours: payrollForm.travelHours,
      overtimeHours: payrollForm.overtimeHours,
    },
    { enabled: tab === "payroll" }
  );

  const employee = workspace.data?.employee;
  const data = workspace.data;

  useMemo(() => {
    if (!employee) return;
    setProfileForm({
      name: employee.name,
      employeeRole: employee.employeeRole || "",
      phone: employee.phone || "",
      email: employee.email,
      address: employee.address || "",
      profilePhotoUrl: employee.profilePhotoUrl || "",
      emergencyContactName: employee.emergencyContactName || "",
      emergencyContactPhone: employee.emergencyContactPhone || "",
      hireDate: employee.hireDate ? new Date(employee.hireDate).toISOString().slice(0, 10) : "",
      employeeCode: employee.employeeCode || "",
      skillsText: employee.skills.join(", "),
      languagesText: employee.languages.join(", "),
      isActive: employee.isActive,
    });

    setPayrollForm((current) => ({
      ...current,
      hourlyRate: Number(employee.hourlyRate || 0),
      specialJobAdjustment: Number(employee.specialJobAdjustment || 0),
      overtimeMultiplier: Number(employee.overtimeMultiplier || 1.5),
      overtimeRate: employee.overtimeRate == null ? "" : String(Number(employee.overtimeRate)),
      travelPayEnabled: employee.travelPayEnabled,
      defaultTravelHours: Number(employee.defaultTravelHours || 0),
      travelRateType: employee.travelRateType,
      customTravelRate: employee.customTravelRate == null ? "" : String(Number(employee.customTravelRate)),
      payrollNotes: employee.payrollNotes || "",
    }));
  }, [employee]);

  if (workspace.isLoading || !employee || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" description="Loading employee workspace" actions={<Link href="/employees" className="btn btn-secondary">Back</Link>} />
        <div className="card p-6 text-slate-500">Loading…</div>
      </div>
    );
  }

  const certificationSummary = employee.employeeCertifications.length
    ? `${employee.employeeCertifications.length} certifications`
    : "No certifications";
  const averageReviewScore = data.performance.averageReviewScore;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur border-b border-slate-200 py-3">
        <PageHeader
          title={employee.name}
          description={`${employee.employeeRole || "Employee"} • ${employee.isActive ? "Active" : "Inactive"}`}
          actions={<Link href="/employees" className="btn btn-secondary">Back to Employees</Link>}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Hourly Rate" value={`$${Number(employee.hourlyRate || 0).toFixed(2)}`} />
        <Kpi label="Active Jobs" value={String(data.jobsByBucket.current.length)} />
        <Kpi label="Avg Hours/Week" value={data.performance.averageHoursPerWeek.toFixed(1)} />
        <Kpi label="Attendance" value={`${data.performance.attendanceScore}%`} />
        <Kpi label="Certifications" value={String(employee.employeeCertifications.length)} />
      </div>

      <div className="card p-2">
        <div className="flex flex-wrap gap-2">
          {[
            ["overview", "Overview"],
            ["payroll", "Payroll"],
            ["time-history", "Time History"],
            ["assigned-jobs", "Assigned Jobs"],
            ["certifications", "Certifications"],
            ["documents", "Documents"],
            ["performance", "Performance"],
            ["notes", "Notes"],
            ["activity", "Activity Timeline"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setTab(key as EmployeeTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 p-4">
              {employee.profilePhotoUrl ? (
                <img src={employee.profilePhotoUrl} alt={employee.name} className="h-32 w-32 rounded-full object-cover mx-auto" />
              ) : (
                <div className="h-32 w-32 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-500">No Photo</div>
              )}
              <Field label="Profile Photo URL" value={profileForm.profilePhotoUrl} onChange={(v) => setProfileForm((f) => ({ ...f, profilePhotoUrl: v }))} />
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Full Name" value={profileForm.name} onChange={(v) => setProfileForm((f) => ({ ...f, name: v }))} />
              <Field label="Position" value={profileForm.employeeRole} onChange={(v) => setProfileForm((f) => ({ ...f, employeeRole: v }))} />
              <Field label="Phone" value={profileForm.phone} onChange={(v) => setProfileForm((f) => ({ ...f, phone: v }))} />
              <Field label="Email" value={profileForm.email} onChange={(v) => setProfileForm((f) => ({ ...f, email: v }))} />
              <Field label="Address" value={profileForm.address} onChange={(v) => setProfileForm((f) => ({ ...f, address: v }))} />
              <Field label="Employee ID" value={profileForm.employeeCode} onChange={(v) => setProfileForm((f) => ({ ...f, employeeCode: v }))} />
              <Field label="Hire Date" value={profileForm.hireDate} onChange={(v) => setProfileForm((f) => ({ ...f, hireDate: v }))} type="date" />
              <div>
                <label className="label">Status</label>
                <select className="input" value={profileForm.isActive ? "active" : "inactive"} onChange={(event) => setProfileForm((f) => ({ ...f, isActive: event.target.value === "active" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <Field label="Emergency Contact Name" value={profileForm.emergencyContactName} onChange={(v) => setProfileForm((f) => ({ ...f, emergencyContactName: v }))} />
              <Field label="Emergency Contact Phone" value={profileForm.emergencyContactPhone} onChange={(v) => setProfileForm((f) => ({ ...f, emergencyContactPhone: v }))} />
              <Field label="Skills (comma separated)" value={profileForm.skillsText} onChange={(v) => setProfileForm((f) => ({ ...f, skillsText: v }))} />
              <Field label="Languages (comma separated)" value={profileForm.languagesText} onChange={(v) => setProfileForm((f) => ({ ...f, languagesText: v }))} />
            </div>
          </div>
          <div className="text-sm text-slate-600">Certification summary: {certificationSummary}</div>
          <div className="flex justify-end">
            <button
              className="btn btn-primary"
              disabled={updateProfile.isPending}
              onClick={() =>
                updateProfile.mutate({
                  id,
                  data: {
                    name: profileForm.name,
                    employeeRole: profileForm.employeeRole || undefined,
                    phone: profileForm.phone || undefined,
                    email: profileForm.email,
                    address: profileForm.address || undefined,
                    profilePhotoUrl: profileForm.profilePhotoUrl || undefined,
                    emergencyContactName: profileForm.emergencyContactName || undefined,
                    emergencyContactPhone: profileForm.emergencyContactPhone || undefined,
                    hireDate: profileForm.hireDate ? new Date(profileForm.hireDate) : null,
                    employeeCode: profileForm.employeeCode || undefined,
                    isActive: profileForm.isActive,
                    skills: profileForm.skillsText.split(",").map((s) => s.trim()).filter(Boolean),
                    languages: profileForm.languagesText.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
            >
              {updateProfile.isPending ? "Saving…" : "Save Overview"}
            </button>
          </div>
        </div>
      )}

      {tab === "payroll" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Payroll Settings</h2>
            <Field label="Regular Hourly Rate" type="number" value={String(payrollForm.hourlyRate)} onChange={(v) => setPayrollForm((f) => ({ ...f, hourlyRate: Number(v || 0) }))} />
            <Field label="Special Job Adjustment (+$/hr)" type="number" value={String(payrollForm.specialJobAdjustment)} onChange={(v) => setPayrollForm((f) => ({ ...f, specialJobAdjustment: Number(v || 0) }))} />
            <Field label="Overtime Multiplier" type="number" value={String(payrollForm.overtimeMultiplier)} onChange={(v) => setPayrollForm((f) => ({ ...f, overtimeMultiplier: Number(v || 1.5) }))} />
            <Field label="Custom Overtime Rate" type="number" value={payrollForm.overtimeRate} onChange={(v) => setPayrollForm((f) => ({ ...f, overtimeRate: v }))} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={payrollForm.travelPayEnabled} onChange={(event) => setPayrollForm((f) => ({ ...f, travelPayEnabled: event.target.checked }))} />
              Travel Pay Enabled
            </label>
            <Field label="Default Travel Hours" type="number" value={String(payrollForm.defaultTravelHours)} onChange={(v) => setPayrollForm((f) => ({ ...f, defaultTravelHours: Number(v || 0) }))} />
            <div>
              <label className="label">Travel Pay Type</label>
              <select className="input" value={payrollForm.travelRateType} onChange={(event) => setPayrollForm((f) => ({ ...f, travelRateType: event.target.value as "regular" | "special" | "custom" }))}>
                <option value="regular">Regular</option>
                <option value="special">Special</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {payrollForm.travelRateType === "custom" ? (
              <Field label="Custom Travel Rate" type="number" value={payrollForm.customTravelRate} onChange={(v) => setPayrollForm((f) => ({ ...f, customTravelRate: v }))} />
            ) : null}
            <div>
              <label className="label">Payroll Notes</label>
              <textarea className="input min-h-[100px]" value={payrollForm.payrollNotes} onChange={(event) => setPayrollForm((f) => ({ ...f, payrollNotes: event.target.value }))} />
            </div>
            <button
              className="btn btn-primary"
              disabled={updatePayroll.isPending}
              onClick={() =>
                updatePayroll.mutate({
                  id,
                  data: {
                    hourlyRate: payrollForm.hourlyRate,
                    specialJobAdjustment: payrollForm.specialJobAdjustment,
                    overtimeMultiplier: payrollForm.overtimeMultiplier,
                    overtimeRate: payrollForm.overtimeRate ? Number(payrollForm.overtimeRate) : null,
                    travelPayEnabled: payrollForm.travelPayEnabled,
                    defaultTravelHours: payrollForm.defaultTravelHours,
                    travelRateType: payrollForm.travelRateType,
                    customTravelRate: payrollForm.customTravelRate ? Number(payrollForm.customTravelRate) : null,
                    payrollNotes: payrollForm.payrollNotes || undefined,
                  },
                })
              }
            >
              {updatePayroll.isPending ? "Saving…" : "Save Payroll"}
            </button>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Live Payroll Example</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular Hours" type="number" value={String(payrollForm.regularHours)} onChange={(v) => setPayrollForm((f) => ({ ...f, regularHours: Number(v || 0) }))} />
              <Field label="Special Hours" type="number" value={String(payrollForm.specialHours)} onChange={(v) => setPayrollForm((f) => ({ ...f, specialHours: Number(v || 0) }))} />
              <Field label="Travel Hours" type="number" value={String(payrollForm.travelHours)} onChange={(v) => setPayrollForm((f) => ({ ...f, travelHours: Number(v || 0) }))} />
              <Field label="Overtime Hours" type="number" value={String(payrollForm.overtimeHours)} onChange={(v) => setPayrollForm((f) => ({ ...f, overtimeHours: Number(v || 0) }))} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
              <Row label="Regular Hours" value={`${payrollForm.regularHours.toFixed(2)}h`} />
              <Row label="Special Hours" value={`${payrollForm.specialHours.toFixed(2)}h`} />
              <Row label="Travel Hours" value={`${payrollForm.travelHours.toFixed(2)}h`} />
              <Row label="Overtime Hours" value={`${payrollForm.overtimeHours.toFixed(2)}h`} />
              <Row label="Estimated Gross Pay" value={`$${Number(preview.data?.estimatedGrossPay || 0).toFixed(2)}`} strong />
            </div>
          </div>
        </div>
      )}

      {tab === "time-history" && (
        <div className="card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Time History</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Start Date" type="date" value={startDate} onChange={setStartDate} />
            <Field label="End Date" type="date" value={endDate} onChange={setEndDate} />
            <div className="flex items-end">
              <button className="btn btn-secondary w-full" onClick={() => workspace.refetch()}>Apply Filters</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Clock In</th>
                  <th className="px-3 py-2">Clock Out</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">Breaks</th>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">GPS</th>
                  <th className="px-3 py-2">Manual</th>
                  <th className="px-3 py-2 text-right">Payroll Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.timeEntries.map((entry) => {
                  const hours = Number(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked ?? 0);
                  const pay = hours * Number(employee.hourlyRate || 0);
                  const gpsStatus = entry.clockInLatitude && entry.clockInLongitude ? "Captured" : "Missing";
                  return (
                    <tr key={entry.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{formatDateTime(entry.clockIn)}</td>
                      <td className="px-3 py-2">{entry.clockOut ? formatDateTime(entry.clockOut) : "—"}</td>
                      <td className="px-3 py-2">{hours.toFixed(2)}</td>
                      <td className="px-3 py-2">{entry.breakDeductionMinutes || entry.breakMinutes || 0} min</td>
                      <td className="px-3 py-2">{entry.job?.name || "No job"}</td>
                      <td className="px-3 py-2">{gpsStatus}</td>
                      <td className="px-3 py-2">{entry.isManual ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-right">${pay.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "assigned-jobs" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <JobBucket title="Current Jobs" rows={data.jobsByBucket.current} />
          <JobBucket title="Upcoming Jobs" rows={data.jobsByBucket.upcoming} />
          <JobBucket title="Completed Jobs" rows={data.jobsByBucket.completed} />
        </div>
      )}

      {tab === "certifications" && (
        <div className="card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Certifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Certification" value={certForm.name} onChange={(v) => setCertForm((f) => ({ ...f, name: v }))} />
            <Field label="Authority" value={certForm.issuingAuthority} onChange={(v) => setCertForm((f) => ({ ...f, issuingAuthority: v }))} />
            <div>
              <label className="label">Status</label>
              <select className="input" value={certForm.status} onChange={(event) => setCertForm((f) => ({ ...f, status: event.target.value as "active" | "expiring_soon" | "expired" }))}>
                <option value="active">Active</option>
                <option value="expiring_soon">Expiring Soon</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <Field label="Issue Date" type="date" value={certForm.issueDate} onChange={(v) => setCertForm((f) => ({ ...f, issueDate: v }))} />
            <Field label="Expiration Date" type="date" value={certForm.expirationDate} onChange={(v) => setCertForm((f) => ({ ...f, expirationDate: v }))} />
            <Field label="Reminder (days)" type="number" value={String(certForm.reminderDays)} onChange={(v) => setCertForm((f) => ({ ...f, reminderDays: Number(v || 30) }))} />
            <div className="md:col-span-3">
              <label className="label">Notes</label>
              <textarea className="input min-h-[90px]" value={certForm.notes} onChange={(event) => setCertForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() =>
              addCertification.mutate({
                userId: id,
                name: certForm.name,
                issuingAuthority: certForm.issuingAuthority || undefined,
                issueDate: certForm.issueDate ? new Date(certForm.issueDate) : null,
                expirationDate: certForm.expirationDate ? new Date(certForm.expirationDate) : null,
                reminderDays: certForm.reminderDays,
                status: certForm.status,
                notes: certForm.notes || undefined,
              })
            }
            disabled={!certForm.name || addCertification.isPending}
          >
            {addCertification.isPending ? "Saving…" : "Add Certification"}
          </button>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Expiration Date</th>
                  <th className="px-3 py-2">Reminder</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employee.employeeCertifications.map((certification) => (
                  <tr key={certification.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{certification.name}</td>
                    <td className="px-3 py-2">{certification.issueDate ? formatDate(certification.issueDate) : "—"}</td>
                    <td className="px-3 py-2">{certification.expirationDate ? formatDate(certification.expirationDate) : "—"}</td>
                    <td className="px-3 py-2">{certification.reminderDays} days</td>
                    <td className="px-3 py-2 capitalize">{certification.status.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn btn-secondary" onClick={() => removeCertification.mutate({ id: certification.id })}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={docForm.type} onChange={(event) => setDocForm((f) => ({ ...f, type: event.target.value as typeof docForm.type }))}>
                <option value="driver_license">Driver License</option>
                <option value="osha_card">OSHA Card</option>
                <option value="contract">Contract</option>
                <option value="w9">W9</option>
                <option value="i9">I9</option>
                <option value="insurance">Insurance</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <Field label="Title" value={docForm.title} onChange={(v) => setDocForm((f) => ({ ...f, title: v }))} />
            <Field label="File Name" value={docForm.fileName} onChange={(v) => setDocForm((f) => ({ ...f, fileName: v }))} />
            <Field label="File URL" value={docForm.fileUrl} onChange={(v) => setDocForm((f) => ({ ...f, fileUrl: v }))} />
            <Field label="MIME Type" value={docForm.mimeType} onChange={(v) => setDocForm((f) => ({ ...f, mimeType: v }))} />
            <Field label="Notes" value={docForm.notes} onChange={(v) => setDocForm((f) => ({ ...f, notes: v }))} />
          </div>
          <button
            className="btn btn-primary"
            disabled={!docForm.title || !docForm.fileName || addDocument.isPending}
            onClick={() =>
              addDocument.mutate({
                userId: id,
                type: docForm.type,
                title: docForm.title,
                fileName: docForm.fileName,
                fileUrl: docForm.fileUrl || undefined,
                mimeType: docForm.mimeType || undefined,
                notes: docForm.notes || undefined,
              })
            }
          >
            {addDocument.isPending ? "Saving…" : "Upload Document"}
          </button>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employee.employeeDocuments.map((document) => (
                  <tr key={document.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 capitalize">{document.type.replace("_", " ")}</td>
                    <td className="px-3 py-2">{document.title}</td>
                    <td className="px-3 py-2">{document.fileUrl ? <a href={document.fileUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open</a> : document.fileName}</td>
                    <td className="px-3 py-2">{formatDate(document.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn btn-secondary" onClick={() => removeDocument.mutate({ id: document.id })}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "performance" && (
        <div className="card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Kpi label="Attendance" value={`${data.performance.attendanceScore}%`} />
            <Kpi label="Average Hours/Week" value={data.performance.averageHoursPerWeek.toFixed(1)} />
            <Kpi label="Late Arrivals" value={String(data.performance.lateArrivals)} />
            <Kpi label="Missed Punches" value={String(data.performance.missedPunches)} />
            <Kpi label="Productivity" value={`${data.performance.productivityScore}%`} />
            <Kpi label="Jobs Completed" value={String(data.performance.jobsCompleted)} />
            <Kpi label="Average Review Score" value={averageReviewScore == null ? "—" : Number(averageReviewScore).toFixed(1)} />
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div className="card p-5 space-y-4">
          <h2 className="text-lg font-semibold">Private Notes</h2>
          <textarea className="input min-h-[110px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add private manager note..." />
          <button className="btn btn-primary" onClick={() => addNote.mutate({ userId: id, note })} disabled={!note.trim() || addNote.isPending}>
            {addNote.isPending ? "Saving…" : "Save Note"}
          </button>

          <div className="space-y-2">
            {employee.employeeNotes.map((employeeNote) => (
              <div key={employeeNote.id} className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{formatDateTime(employeeNote.createdAt)} • {employeeNote.author.name}</div>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{employeeNote.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "activity" && (
        <Timeline
          items={data.timeline}
          emptyTitle="No activity yet"
          emptyDescription="Employee events will appear here in chronological order."
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={strong ? "font-semibold text-slate-900" : "text-slate-900"}>{value}</span>
    </div>
  );
}

function JobBucket({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: number; name: string; customerName: string; status: string; hoursWorked: number; laborCost: number; completionPercent: number }>;
}) {
  return (
    <div className="card p-4">
      <h3 className="text-base font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs in this group.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((job) => (
            <div key={job.id} className="rounded-xl border border-slate-200 p-3">
              <div className="font-medium text-slate-900">{job.name}</div>
              <div className="text-xs text-slate-500">{job.customerName}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>Hours: {job.hoursWorked.toFixed(2)}</div>
                <div>Labor: ${job.laborCost.toFixed(2)}</div>
                <div>Done: {job.completionPercent}%</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
