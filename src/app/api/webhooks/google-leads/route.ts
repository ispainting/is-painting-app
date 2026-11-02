import { NextResponse } from "next/server";
import { checkGoogleKey } from "@/lib/leads/webhook-auth";
import { isTestLead, leadFromGoogle, type GoogleLeadBody } from "@/lib/leads/normalize";
import { errorCode, intakeLead } from "@/lib/leads/record-lead";

// Google Ads lead form webhook. Google sends the whole lead, with the webhook's key in the body. A
// 500 makes Google deliver it again, and saving twice is harmless (src/lib/leads/record-lead.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as GoogleLeadBody | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const auth = checkGoogleKey(body.google_key);
  if (auth === "unconfigured") {
    console.error("[webhooks/google-leads] GOOGLE_LEADS_WEBHOOK_KEY is not set — refusing delivery");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Invalid key" }, { status: 401 });

  // Google's "send test data" button: the connection works, and no junk lead is saved.
  if (body.is_test === true) return NextResponse.json({ status: "test_ok" });

  const intake = leadFromGoogle(body);
  if (!intake) return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
  if (isTestLead(intake)) return NextResponse.json({ status: "test_ok" });

  try {
    const { inbox } = await intakeLead(intake, "Webhook");
    return NextResponse.json({ status: inbox }, { status: inbox === "failed" ? 500 : 200 });
  } catch (err) {
    console.error("[webhooks/google-leads] lead failed", errorCode(err));
    return NextResponse.json({ error: "Lead intake failed" }, { status: 500 });
  }
}
