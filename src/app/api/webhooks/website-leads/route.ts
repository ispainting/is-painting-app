import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { checkWebsiteSecret } from "@/lib/leads/webhook-auth";
import { leadFromWebsite } from "@/lib/leads/normalize";
import { errorCode, intakeLead } from "@/lib/leads/record-lead";

// The website form, server to server: the `x-webhook-secret` header can't be sent from a visitor's
// browser, where anyone could read it. Takes JSON or form fields, named in Portuguese or English.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseBody(raw: string, contentType: string): Record<string, unknown> | null {
  if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = checkWebsiteSecret(req);
  if (auth === "unconfigured") {
    console.error("[webhooks/website-leads] WEBSITE_LEADS_SECRET is not set — refusing delivery");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.text();
  const body = parseBody(raw, req.headers.get("content-type") ?? "");
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // With no id from the sender, the same form sent twice on the same day is one delivery.
  const fallbackId = createHash("sha256").update(`${new Date().toISOString().slice(0, 10)}:${raw}`).digest("hex");
  const intake = leadFromWebsite(body, fallbackId);
  if (!intake) return NextResponse.json({ error: "A phone or an email is required" }, { status: 400 });

  try {
    const { inbox } = await intakeLead(intake, "Webhook");
    return NextResponse.json({ status: inbox }, { status: inbox === "failed" ? 500 : 200 });
  } catch (err) {
    console.error("[webhooks/website-leads] lead failed", errorCode(err));
    return NextResponse.json({ error: "Lead intake failed" }, { status: 500 });
  }
}
