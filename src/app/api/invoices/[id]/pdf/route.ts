import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { buildInvoicePdf, canAccessInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

type Params = { params: { id: string } };

function address(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

export async function GET(req: Request, { params }: Params) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid invoice id." }, { status: 400 });

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      job: { include: { assignments: { select: { userId: true } } } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { dateReceived: "asc" } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (!canAccessInvoicePdf(session.role, session.userId, invoice.job.assignments.map((assignment) => assignment.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pdf = await buildInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    status: invoice.status,
    createdAt: invoice.createdAt,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    subtotal: Number(invoice.subtotal),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    amountPaid: Number(invoice.amountPaid),
    amountRemaining: Math.max(0, Number(invoice.amountRemaining)),
    customerName: invoice.customer.name,
    customerAddress: address([invoice.customer.address, invoice.customer.city, invoice.customer.state, invoice.customer.zipCode]),
    projectName: invoice.job.name,
    projectAddress: address([invoice.job.address, invoice.job.city, invoice.job.state, invoice.job.zipCode]),
    lineItems: invoice.lineItems.map((lineItem) => ({
      description: lineItem.description,
      quantity: Number(lineItem.quantity),
      unitPrice: Number(lineItem.unitPrice),
      totalPrice: Number(lineItem.totalPrice),
    })),
    payments: invoice.payments.map((payment) => ({
      dateReceived: payment.dateReceived,
      method: payment.method,
      amount: Number(payment.amount),
      memo: payment.memo,
    })),
  });
  const disposition = new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline";

  return new Response(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
