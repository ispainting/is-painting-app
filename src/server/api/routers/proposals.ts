import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { nextNumber } from "@/lib/utils";

const ProposalStatusZ = z.enum(["draft", "sent", "approved", "declined", "follow_up"]);

const proposalInput = z.object({
  customerId: z.number(),
  projectName: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  status: ProposalStatusZ.default("draft"),
  scopeOfWork: z.string().optional(),
  notes: z.string().optional(),
  materialsBudget: z.number().min(0).default(0),
  laborBudget: z.number().min(0).default(0),
  subcontractorBudget: z.number().min(0).default(0),
  totalAmount: z.number().min(0).optional(),
});

export const proposalsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.proposal.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.proposal.findUnique({
      where: { id: input.id },
      include: { customer: true },
    })
  ),

  create: adminProcedure.input(proposalInput).mutation(async ({ ctx, input }) => {
    const last = await ctx.prisma.proposal.findFirst({
      orderBy: { id: "desc" },
      select: { proposalNumber: true },
    });

    const proposalNumber = nextNumber("PROP", last?.proposalNumber);
    const budgetTotal = input.materialsBudget + input.laborBudget + input.subcontractorBudget;

    return ctx.prisma.proposal.create({
      data: {
        ...input,
        proposalNumber,
        totalAmount: input.totalAmount ?? budgetTotal,
        sentAt: input.status === "sent" ? new Date() : null,
        approvedAt: input.status === "approved" ? new Date() : null,
      },
    });
  }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: ProposalStatusZ }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.proposal.update({
        where: { id: input.id },
        data: {
          status: input.status,
          sentAt: input.status === "sent" ? new Date() : undefined,
          approvedAt: input.status === "approved" ? new Date() : undefined,
        },
      })
    ),
});
