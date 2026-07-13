import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../trpc";

const customerPhoneSchema = z.object({
  label: z.string().optional(),
  number: z.string().min(1),
});

const customerEmailSchema = z.object({
  label: z.string().optional(),
  email: z.string().email(),
});

const customerPropertySchema = z.object({
  label: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
});

const customerColorPreferenceSchema = z.object({
  area: z.string().optional(),
  colorName: z.string().min(1),
  brand: z.string().optional(),
  notes: z.string().optional(),
});

const customerPaintHistorySchema = z.object({
  area: z.string().optional(),
  colorName: z.string().min(1),
  brand: z.string().optional(),
  product: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

const customerProductHistorySchema = z.object({
  productName: z.string().min(1),
  brand: z.string().optional(),
  colorName: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

const customerWarrantyHistorySchema = z.object({
  title: z.string().min(1),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

const customerEmergencyContactSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  relationship: z.string().optional(),
});

const customerInput = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  source: z.string().optional(),
  leadSource: z.string().optional(),
  referralSource: z.string().optional(),
  status: z.string().optional(),
  preferredCommunication: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  secondaryPhoneNumbers: z.array(customerPhoneSchema).default([]),
  secondaryEmails: z.array(customerEmailSchema).default([]),
  properties: z.array(customerPropertySchema).default([]),
  emergencyContact: customerEmergencyContactSchema.optional(),
  colorPreferences: z.array(customerColorPreferenceSchema).default([]),
  paintHistory: z.array(customerPaintHistorySchema).default([]),
  productHistory: z.array(customerProductHistorySchema).default([]),
  warrantyHistory: z.array(customerWarrantyHistorySchema).default([]),
  lastContactAt: z.coerce.date().optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

const customerUpdateInput = customerInput.partial();

const customerListInput = z
  .object({
    search: z.string().optional(),
    statuses: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    leadSources: z.array(z.string()).optional(),
    sortBy: z
      .enum(["name", "createdAt", "lastContact", "lifetimeValue", "openBalance", "activeJobs", "proposalCount"])
      .default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    onlyWithOpenBalance: z.boolean().optional(),
    onlyWithActiveJobs: z.boolean().optional(),
  })
  .optional();

const touchpointInput = z.object({
  customerId: z.number(),
  type: z.enum(["call", "email", "sms", "note", "follow_up"]),
  subject: z.string().optional(),
  body: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
  isPinned: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const touchpointUpdateInput = z.object({
  id: z.number(),
  data: z.object({
    subject: z.string().optional(),
    body: z.string().optional(),
    occurredAt: z.coerce.date().optional(),
    isPinned: z.boolean().optional(),
  }),
});

const customerFileInput = z.object({
  customerId: z.number(),
  type: z.enum(["attachment", "photo"]),
  fileName: z.string().min(1),
  fileUrl: z.string().url().optional().or(z.literal("")),
  previewUrl: z.string().url().optional().or(z.literal("")),
  mimeType: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const customerFileUpdateInput = z.object({
  id: z.number(),
  data: z.object({
    fileName: z.string().min(1).optional(),
    fileUrl: z.string().url().optional().or(z.literal("")),
    previewUrl: z.string().url().optional().or(z.literal("")),
    mimeType: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

const bulkCustomerActionInput = z.object({
  ids: z.array(z.number()).min(1),
  action: z.enum(["add_tags", "remove_tags", "set_status", "delete"]),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
});

type TimelineEventType =
  | "customer_created"
  | "estimate_created"
  | "proposal_created"
  | "proposal_sent"
  | "proposal_viewed"
  | "proposal_accepted"
  | "job_started"
  | "invoice_sent"
  | "payment_received"
  | "job_completed"
  | "review_requested"
  | "document_added"
  | "photo_added"
  | "touchpoint";

type TimelineEvent = {
  at: Date;
  type: TimelineEventType;
  title: string;
  description?: string;
};

const ACTIVE_JOB_STATUSES = new Set(["estimate", "sent", "approved", "active", "on_hold"]);

function asNullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function money(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function totalHours(entry: { paidHours: unknown; grossHours: unknown; hoursWorked: unknown }) {
  return money(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function parseArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseObject<T>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

function buildCustomerSearchText(customer: {
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  source: string | null;
  leadSource: string | null;
  referralSource: string | null;
  status: string | null;
  tags: string[];
  secondaryPhoneNumbers: unknown;
  secondaryEmails: unknown;
  properties: unknown;
}) {
  const propertyParts = parseArray<Record<string, unknown>>(customer.properties).flatMap((property) => [
    property.label,
    property.street,
    property.city,
    property.state,
    property.zipCode,
    property.notes,
  ]);
  const phoneParts = parseArray<Record<string, unknown>>(customer.secondaryPhoneNumbers).flatMap((item) => [
    item.label,
    item.number,
  ]);
  const emailParts = parseArray<Record<string, unknown>>(customer.secondaryEmails).flatMap((item) => [
    item.label,
    item.email,
  ]);
  return [
    customer.name,
    customer.contactName,
    customer.email,
    customer.phone,
    customer.address,
    customer.city,
    customer.state,
    customer.zipCode,
    customer.source,
    customer.leadSource,
    customer.referralSource,
    customer.status,
    ...customer.tags,
    ...propertyParts,
    ...phoneParts,
    ...emailParts,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function serializeCustomerInput(input: Partial<z.infer<typeof customerInput>>) {
  return {
    name: input.name,
    contactName: input.contactName === undefined ? undefined : asNullableText(input.contactName),
    email: input.email === undefined ? undefined : asNullableText(input.email),
    phone: input.phone === undefined ? undefined : asNullableText(input.phone),
    address: input.address === undefined ? undefined : asNullableText(input.address),
    city: input.city === undefined ? undefined : asNullableText(input.city),
    state: input.state === undefined ? undefined : asNullableText(input.state),
    zipCode: input.zipCode === undefined ? undefined : asNullableText(input.zipCode),
    source: input.source === undefined ? undefined : asNullableText(input.source),
    leadSource: input.leadSource === undefined ? undefined : asNullableText(input.leadSource),
    referralSource: input.referralSource === undefined ? undefined : asNullableText(input.referralSource),
    status: input.status === undefined ? undefined : asNullableText(input.status),
    preferredCommunication:
      input.preferredCommunication === undefined ? undefined : asNullableText(input.preferredCommunication),
    tags: input.tags === undefined ? undefined : uniqueTags(input.tags),
    notes: input.notes === undefined ? undefined : asNullableText(input.notes),
    secondaryPhoneNumbers:
      input.secondaryPhoneNumbers === undefined ? undefined : toJsonValue(input.secondaryPhoneNumbers),
    secondaryEmails: input.secondaryEmails === undefined ? undefined : toJsonValue(input.secondaryEmails),
    properties: input.properties === undefined ? undefined : toJsonValue(input.properties),
    emergencyContact:
      input.emergencyContact === undefined
        ? undefined
        : input.emergencyContact && Object.values(input.emergencyContact).some(Boolean)
          ? toJsonValue(input.emergencyContact)
          : Prisma.JsonNull,
    colorPreferences: input.colorPreferences === undefined ? undefined : toJsonValue(input.colorPreferences),
    paintHistory: input.paintHistory === undefined ? undefined : toJsonValue(input.paintHistory),
    productHistory: input.productHistory === undefined ? undefined : toJsonValue(input.productHistory),
    warrantyHistory: input.warrantyHistory === undefined ? undefined : toJsonValue(input.warrantyHistory),
    lastContactAt: input.lastContactAt,
    nextFollowUpAt: input.nextFollowUpAt,
  };
}

async function writeCustomerAudit(
  ctx: { prisma: any; session: { userId: number } | null },
  customerId: number,
  action: string,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
) {
  if (!ctx.session?.userId) return;
  await ctx.prisma.auditLog.create({
    data: {
      userId: ctx.session.userId,
      action,
      entityType: "customer",
      entityId: customerId,
      before,
      after,
    },
  });
}

export const customersRouter = router({
  list: protectedProcedure.input(customerListInput).query(async ({ ctx, input }) => {
    const customers = await ctx.prisma.customer.findMany({
      where: { deletedAt: null },
      include: {
        jobs: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            contractAmount: true,
            totalEstimate: true,
            payments: { select: { amount: true } },
          },
        },
        invoices: {
          select: { amountRemaining: true },
        },
        touchpoints: {
          where: { deletedAt: null },
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true },
        },
        _count: {
          select: {
            proposals: { where: { deletedAt: null } },
          },
        },
      },
      take: 500,
    });

    const search = normalizeText(input?.search);
    const rows = customers.map((customer) => {
      const lifetimeValue = customer.jobs.reduce(
        (sum, job) => sum + job.payments.reduce((jobSum, payment) => jobSum + money(payment.amount), 0),
        0,
      );
      const openBalance = customer.invoices.reduce((sum, invoice) => sum + money(invoice.amountRemaining), 0);
      const activeJobs = customer.jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
      const lastContactAt = [customer.lastContactAt, customer.touchpoints[0]?.occurredAt]
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      const proposalCount = customer._count.proposals;

      return {
        id: customer.id,
        name: customer.name,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zipCode: customer.zipCode,
        source: customer.source,
        leadSource: customer.leadSource,
        referralSource: customer.referralSource,
        status: customer.status,
        tags: customer.tags,
        notes: customer.notes,
        createdAt: customer.createdAt,
        lastContactAt,
        metrics: {
          lifetimeValue,
          openBalance,
          activeJobs,
          proposalCount,
        },
        searchText: buildCustomerSearchText(customer),
      };
    });

    const filtered = rows.filter((row) => {
      if (search && !row.searchText.includes(search)) return false;
      if (input?.statuses?.length && !input.statuses.includes(row.status ?? "")) return false;
      if (input?.leadSources?.length && !input.leadSources.includes(row.leadSource ?? row.source ?? "")) return false;
      if (input?.tags?.length && !input.tags.some((tag) => row.tags.includes(tag))) return false;
      if (input?.onlyWithOpenBalance && row.metrics.openBalance <= 0) return false;
      if (input?.onlyWithActiveJobs && row.metrics.activeJobs <= 0) return false;
      return true;
    });

    filtered.sort((left, right) => {
      const direction = input?.sortDirection === "asc" ? 1 : -1;
      const sortBy = input?.sortBy ?? "createdAt";

      if (sortBy === "name") return left.name.localeCompare(right.name) * direction;
      if (sortBy === "lastContact") return ((left.lastContactAt?.getTime() ?? 0) - (right.lastContactAt?.getTime() ?? 0)) * direction;
      if (sortBy === "lifetimeValue") return (left.metrics.lifetimeValue - right.metrics.lifetimeValue) * direction;
      if (sortBy === "openBalance") return (left.metrics.openBalance - right.metrics.openBalance) * direction;
      if (sortBy === "activeJobs") return (left.metrics.activeJobs - right.metrics.activeJobs) * direction;
      if (sortBy === "proposalCount") return (left.metrics.proposalCount - right.metrics.proposalCount) * direction;
      return (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
    });

    return filtered.map(({ searchText: _searchText, ...row }) => row);
  }),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.customer.findUnique({
      where: { id: input.id },
      include: {
        jobs: { where: { deletedAt: null } },
        opportunities: true,
        invoices: true,
      },
    })
  ),

  profile: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const customer = await ctx.prisma.customer.findUnique({
      where: { id: input.id },
      include: {
        jobs: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            status: true,
            estimateNumber: true,
            contractAmount: true,
            totalEstimate: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            createdAt: true,
            startDate: true,
            endDate: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        proposals: {
          where: { deletedAt: null },
          select: {
            id: true,
            proposalNumber: true,
            projectName: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            sentAt: true,
            approvedAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            title: true,
            status: true,
            total: true,
            amountPaid: true,
            amountRemaining: true,
            sentAt: true,
            dueDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        opportunities: {
          select: {
            id: true,
            name: true,
            status: true,
            stage: true,
            leadValue: true,
            source: true,
            createdAt: true,
            updatedAt: true,
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        touchpoints: {
          where: { deletedAt: null },
          include: {
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: [{ isPinned: "desc" }, { occurredAt: "desc" }],
          take: 300,
        },
        files: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 300,
        },
        reviewSubmissions: {
          select: { id: true, rating: true, feedback: true, createdAt: true, submittedAt: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });

    if (!customer || customer.deletedAt) return null;

    const [payments, expenses, timeEntries, automationRuns, activityLog] = await Promise.all([
      ctx.prisma.payment.findMany({
        where: { job: { customerId: input.id, deletedAt: null } },
        orderBy: { dateReceived: "desc" },
        take: 300,
        select: {
          id: true,
          amount: true,
          dateReceived: true,
          method: true,
          status: true,
          memo: true,
          invoice: { select: { id: true, invoiceNumber: true, title: true, sentAt: true, createdAt: true } },
          job: { select: { id: true, name: true } },
        },
      }),
      ctx.prisma.expense.findMany({
        where: { job: { customerId: input.id, deletedAt: null } },
        select: { amount: true },
        take: 500,
      }),
      ctx.prisma.timeEntry.findMany({
        where: { job: { customerId: input.id, deletedAt: null } },
        select: {
          paidHours: true,
          grossHours: true,
          hoursWorked: true,
          user: { select: { hourlyRate: true } },
        },
        take: 1000,
      }),
      ctx.prisma.automationRun.findMany({
        where: { opportunity: { customerId: input.id } },
        include: {
          template: { select: { id: true, displayName: true, name: true } },
          opportunity: { select: { id: true, name: true, stage: true, status: true } },
        },
        orderBy: { nextActionAt: "asc" },
        take: 100,
      }),
      ctx.prisma.auditLog.findMany({
        where: { entityType: "customer", entityId: input.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    const totalRevenue = payments.reduce((sum, payment) => sum + money(payment.amount), 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + money(expense.amount), 0);
    const totalPayroll = timeEntries.reduce((sum, entry) => sum + money(entry.user.hourlyRate) * totalHours(entry), 0);
    const totalProfit = totalRevenue - totalExpenses - totalPayroll;
    const totalJobs = customer.jobs.length;
    const jobsCompleted = customer.jobs.filter((job) => job.status === "completed").length;
    const activeJobs = customer.jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
    const totalProposals = customer.proposals.length;
    const convertedProposals = customer.proposals.filter(
      (proposal) => proposal.status === "approved" || proposal.status === "converted"
    ).length;
    const openBalance = customer.invoices.reduce((sum, invoice) => sum + money(invoice.amountRemaining), 0);
    const averageJobSize = average(
      customer.jobs
        .map((job) => {
          const contractAmount = money(job.contractAmount);
          return contractAmount > 0 ? contractAmount : money(job.totalEstimate);
        })
        .filter((value) => value > 0),
    );
    const paymentTimes = payments
      .filter((payment) => payment.invoice)
      .map((payment) => {
        const startDate = payment.invoice?.sentAt ?? payment.invoice?.createdAt;
        if (!startDate) return null;
        return Math.max(0, (payment.dateReceived.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      })
      .filter((value): value is number => value !== null);
    const latestTouchpoint = customer.touchpoints.find((touchpoint) => !touchpoint.isPinned)?.occurredAt ?? customer.touchpoints[0]?.occurredAt ?? null;
    const computedLastContactAt = [customer.lastContactAt, latestTouchpoint]
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

    const timeline: TimelineEvent[] = [
      {
        at: customer.createdAt,
        type: "customer_created",
        title: "Customer created",
        description: customer.name,
      },
    ];

    for (const job of customer.jobs) {
      timeline.push({
        at: job.createdAt,
        type: "estimate_created",
        title: "Estimate created",
        description: `${job.estimateNumber} • ${job.name}`,
      });
      if (job.startDate) {
        timeline.push({ at: job.startDate, type: "job_started", title: "Job started", description: job.name });
      }
      if (job.endDate || job.status === "completed") {
        timeline.push({
          at: job.endDate || job.updatedAt,
          type: "job_completed",
          title: "Job completed",
          description: job.name,
        });
      }
    }

    for (const proposal of customer.proposals) {
      timeline.push({
        at: proposal.createdAt,
        type: "proposal_created",
        title: "Proposal created",
        description: `${proposal.proposalNumber} • ${proposal.projectName}`,
      });
      if (proposal.sentAt) {
        timeline.push({
          at: proposal.sentAt,
          type: "proposal_sent",
          title: "Proposal sent",
          description: proposal.projectName,
        });
      }
      if (["viewed", "approved", "converted"].includes(proposal.status)) {
        timeline.push({
          at: proposal.updatedAt,
          type: "proposal_viewed",
          title: "Proposal viewed",
          description: proposal.projectName,
        });
      }
      if (proposal.approvedAt || proposal.status === "approved" || proposal.status === "converted") {
        timeline.push({
          at: proposal.approvedAt || proposal.updatedAt,
          type: "proposal_accepted",
          title: "Proposal accepted",
          description: proposal.projectName,
        });
      }
    }

    for (const invoice of customer.invoices) {
      if (invoice.sentAt) {
        timeline.push({
          at: invoice.sentAt,
          type: "invoice_sent",
          title: "Invoice sent",
          description: `${invoice.invoiceNumber} • ${invoice.title}`,
        });
      }
    }

    for (const payment of payments) {
      timeline.push({
        at: payment.dateReceived,
        type: "payment_received",
        title: "Payment received",
        description: `${payment.job.name} • $${money(payment.amount).toFixed(2)}`,
      });
    }

    for (const review of customer.reviewSubmissions) {
      timeline.push({
        at: review.submittedAt || review.createdAt,
        type: "review_requested",
        title: review.submittedAt ? "Review submitted" : "Review requested",
        description: review.feedback || (review.submittedAt ? `Rating: ${review.rating}/5` : "Awaiting customer response"),
      });
    }

    for (const file of customer.files) {
      timeline.push({
        at: file.createdAt,
        type: file.type === "photo" ? "photo_added" : "document_added",
        title: file.type === "photo" ? "Photo added" : "Document added",
        description: [file.fileName, file.category].filter(Boolean).join(" • ") || file.fileName,
      });
    }

    for (const touchpoint of customer.touchpoints) {
      timeline.push({
        at: touchpoint.occurredAt,
        type: "touchpoint",
        title: touchpoint.type === "note" ? "Note added" : `Contact: ${touchpoint.type.replace(/_/g, " ")}`,
        description: touchpoint.subject || touchpoint.body || undefined,
      });
    }

    timeline.sort((left, right) => right.at.getTime() - left.at.getTime());

    return {
      customer: {
        ...customer,
        secondaryPhoneNumbers: parseArray<z.infer<typeof customerPhoneSchema>>(customer.secondaryPhoneNumbers),
        secondaryEmails: parseArray<z.infer<typeof customerEmailSchema>>(customer.secondaryEmails),
        properties: parseArray<z.infer<typeof customerPropertySchema>>(customer.properties),
        emergencyContact: parseObject<z.infer<typeof customerEmergencyContactSchema>>(customer.emergencyContact),
        colorPreferences: parseArray<z.infer<typeof customerColorPreferenceSchema>>(customer.colorPreferences),
        paintHistory: parseArray<z.infer<typeof customerPaintHistorySchema>>(customer.paintHistory),
        productHistory: parseArray<z.infer<typeof customerProductHistorySchema>>(customer.productHistory),
        warrantyHistory: parseArray<z.infer<typeof customerWarrantyHistorySchema>>(customer.warrantyHistory),
      },
      stats: {
        lifetimeRevenue: totalRevenue,
        lifetimeValue: totalRevenue,
        totalProfit,
        averageJobSize,
        jobsCompleted,
        winRate: percentage(convertedProposals, totalProposals),
        averagePaymentTime: average(paymentTimes),
        totalJobs,
        activeJobs,
        totalProposals,
        proposalConversionPercent: percentage(convertedProposals, totalProposals),
        proposalCount: totalProposals,
        openBalance,
        lastContactAt: computedLastContactAt,
        nextFollowUpAt: customer.nextFollowUpAt,
      },
      payments,
      automations: automationRuns,
      activityLog: activityLog.map((entry) => ({
        id: entry.id,
        at: entry.createdAt,
        action: entry.action,
        actor: entry.user.name,
        before: entry.before,
        after: entry.after,
      })),
      timeline,
    };
  }),

  create: adminProcedure.input(customerInput).mutation(async ({ ctx, input }) => {
    const customer = await ctx.prisma.customer.create({
      data: {
        ...serializeCustomerInput(input),
        name: input.name,
      },
    });
    await writeCustomerAudit(ctx, customer.id, "customer.created", null, toJsonValue({ name: customer.name }));
    return customer;
  }),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: customerUpdateInput }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.customer.findUnique({ where: { id: input.id } });
      const customer = await ctx.prisma.customer.update({
        where: { id: input.id },
        data: serializeCustomerInput(input.data),
      });
      await writeCustomerAudit(
        ctx,
        customer.id,
        "customer.updated",
        before ? toJsonValue({ name: before.name, status: before.status, tags: before.tags }) : null,
        toJsonValue({ name: customer.name, status: customer.status, tags: customer.tags }),
      );
      return customer;
    }),

  bulkUpdate: adminProcedure.input(bulkCustomerActionInput).mutation(async ({ ctx, input }) => {
    const customers = await ctx.prisma.customer.findMany({
      where: { id: { in: input.ids }, deletedAt: null },
      select: { id: true, tags: true, status: true, name: true },
    });

    for (const customer of customers) {
      if (input.action === "delete") {
        await ctx.prisma.customer.update({ where: { id: customer.id }, data: { deletedAt: new Date() } });
        await writeCustomerAudit(ctx, customer.id, "customer.deleted", toJsonValue(customer), null);
        continue;
      }

      if (input.action === "set_status") {
        await ctx.prisma.customer.update({ where: { id: customer.id }, data: { status: asNullableText(input.status) } });
        await writeCustomerAudit(
          ctx,
          customer.id,
          "customer.status_updated",
          toJsonValue({ status: customer.status }),
          toJsonValue({ status: input.status ?? null }),
        );
        continue;
      }

      const deltaTags = uniqueTags(input.tags);
      const nextTags =
        input.action === "add_tags"
          ? Array.from(new Set([...customer.tags, ...deltaTags]))
          : customer.tags.filter((tag) => !deltaTags.includes(tag));
      await ctx.prisma.customer.update({ where: { id: customer.id }, data: { tags: nextTags } });
      await writeCustomerAudit(
        ctx,
        customer.id,
        input.action === "add_tags" ? "customer.tags_added" : "customer.tags_removed",
        toJsonValue({ tags: customer.tags }),
        toJsonValue({ tags: nextTags }),
      );
    }

    return { updated: customers.length };
  }),

  addTouchpoint: protectedProcedure.input(touchpointInput).mutation(async ({ ctx, input }) => {
    const touchpoint = await ctx.prisma.customerTouchpoint.create({
      data: {
        customerId: input.customerId,
        createdById: ctx.session.userId,
        type: input.type,
        subject: asNullableText(input.subject),
        body: asNullableText(input.body),
        isPinned: input.isPinned ?? false,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
        occurredAt: input.occurredAt || new Date(),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await writeCustomerAudit(
      ctx,
      input.customerId,
      input.type === "note" ? "customer.note_added" : "customer.touchpoint_added",
      null,
      toJsonValue({ type: input.type, subject: touchpoint.subject, pinned: touchpoint.isPinned }),
    );
    return touchpoint;
  }),

  updateTouchpoint: protectedProcedure.input(touchpointUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.customerTouchpoint.findUnique({ where: { id: input.id } });
    const touchpoint = await ctx.prisma.customerTouchpoint.update({
      where: { id: input.id },
      data: {
        subject: input.data.subject === undefined ? undefined : asNullableText(input.data.subject),
        body: input.data.body === undefined ? undefined : asNullableText(input.data.body),
        occurredAt: input.data.occurredAt,
        isPinned: input.data.isPinned,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await writeCustomerAudit(
      ctx,
      touchpoint.customerId,
      existing?.type === "note" ? "customer.note_updated" : "customer.touchpoint_updated",
      existing ? toJsonValue({ subject: existing.subject, pinned: existing.isPinned }) : null,
      toJsonValue({ subject: touchpoint.subject, pinned: touchpoint.isPinned }),
    );
    return touchpoint;
  }),

  pinTouchpoint: protectedProcedure
    .input(z.object({ id: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const touchpoint = await ctx.prisma.customerTouchpoint.update({
        where: { id: input.id },
        data: { isPinned: input.pinned },
      });
      await writeCustomerAudit(
        ctx,
        touchpoint.customerId,
        input.pinned ? "customer.note_pinned" : "customer.note_unpinned",
        null,
        toJsonValue({ touchpointId: input.id, pinned: input.pinned }),
      );
      return touchpoint;
    }),

  deleteTouchpoint: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const touchpoint = await ctx.prisma.customerTouchpoint.update({
      where: { id: input.id },
      data: { deletedAt: new Date() },
    });
    await writeCustomerAudit(
      ctx,
      touchpoint.customerId,
      touchpoint.type === "note" ? "customer.note_deleted" : "customer.touchpoint_deleted",
      toJsonValue({ touchpointId: touchpoint.id, type: touchpoint.type }),
      null,
    );
    return touchpoint;
  }),

  addFile: adminProcedure.input(customerFileInput).mutation(async ({ ctx, input }) => {
    const file = await ctx.prisma.customerFile.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        fileName: input.fileName,
        fileUrl: asNullableText(input.fileUrl),
        previewUrl: asNullableText(input.previewUrl),
        mimeType: asNullableText(input.mimeType),
        category: asNullableText(input.category),
        notes: asNullableText(input.notes),
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
      },
    });
    await writeCustomerAudit(
      ctx,
      input.customerId,
      input.type === "photo" ? "customer.photo_added" : "customer.document_added",
      null,
      toJsonValue({ fileName: file.fileName, category: file.category, type: file.type }),
    );
    return file;
  }),

  updateFile: adminProcedure.input(customerFileUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.customerFile.findUnique({ where: { id: input.id } });
    const file = await ctx.prisma.customerFile.update({
      where: { id: input.id },
      data: {
        fileName: input.data.fileName,
        fileUrl: input.data.fileUrl === undefined ? undefined : asNullableText(input.data.fileUrl),
        previewUrl: input.data.previewUrl === undefined ? undefined : asNullableText(input.data.previewUrl),
        mimeType: input.data.mimeType === undefined ? undefined : asNullableText(input.data.mimeType),
        category: input.data.category === undefined ? undefined : asNullableText(input.data.category),
        notes: input.data.notes === undefined ? undefined : asNullableText(input.data.notes),
        metadata: input.data.metadata === undefined ? undefined : toJsonValue(input.data.metadata),
      },
    });
    await writeCustomerAudit(
      ctx,
      file.customerId,
      "customer.document_updated",
      existing ? toJsonValue({ fileName: existing.fileName, category: existing.category }) : null,
      toJsonValue({ fileName: file.fileName, category: file.category }),
    );
    return file;
  }),

  removeFile: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const file = await ctx.prisma.customerFile.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    await writeCustomerAudit(
      ctx,
      file.customerId,
      file.type === "photo" ? "customer.photo_deleted" : "customer.document_deleted",
      toJsonValue({ fileName: file.fileName, type: file.type }),
      null,
    );
    return file;
  }),

  softDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const customer = await ctx.prisma.customer.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    await writeCustomerAudit(ctx, customer.id, "customer.deleted", toJsonValue({ name: customer.name }), null);
    return customer;
  }),
});
