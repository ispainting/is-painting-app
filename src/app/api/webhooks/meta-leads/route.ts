import { NextResponse } from "next/server";
import { checkMetaSignature, checkMetaVerifyToken } from "@/lib/leads/webhook-auth";
import { fetchMetaLead } from "@/lib/leads/meta-graph";
import { isTestLead, leadFromMeta, leadgenIdsFromWebhook } from "@/lib/leads/normalize";
import { errorCode, intakeLead } from "@/lib/leads/record-lead";

// Meta's Lead Ads webhook. Each delivery only says which lead arrived, so its answers and its ad come
// from the Graph API. Nothing can run after the response on this runtime, so the lead is saved first
// and the 200 follows; if it couldn't be saved, a 500 makes Meta deliver it again. Saving twice is
// harmless, because the lead's id is unique (src/lib/leads/record-lead.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const auth = checkMetaVerifyToken(params.get("hub.verify_token"));
  if (auth === "unconfigured") {
    console.error("[webhooks/meta-leads] META_WEBHOOK_VERIFY_TOKEN is not set — refusing verification");
    return new Response("Not configured", { status: 503 });
  }
  if (auth === "denied" || params.get("hub.mode") !== "subscribe") return new Response("Forbidden", { status: 403 });
  return new Response(params.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const auth = checkMetaSignature(rawBody, req.headers.get("x-hub-signature-256"));
  if (auth === "unconfigured") {
    console.error("[webhooks/meta-leads] META_APP_SECRET is not set — refusing delivery");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const results: string[] = [];
  let failed = false;
  for (const leadgenId of leadgenIdsFromWebhook(payload)) {
    try {
      const intake = leadFromMeta(await fetchMetaLead(leadgenId));
      if (isTestLead(intake)) {
        results.push("test_ok");
        continue;
      }
      const { inbox } = await intakeLead(intake, "Webhook");
      if (inbox === "failed") failed = true;
      results.push(inbox);
    } catch (err) {
      failed = true;
      results.push("failed");
      // The id alone: it says which lead to look for, and it isn't the customer's data.
      console.error("[webhooks/meta-leads] lead failed", leadgenId, err instanceof Error && err.message.startsWith("Graph API") ? err.message : errorCode(err));
    }
  }
  return NextResponse.json({ results }, { status: failed ? 500 : 200 });
}
