import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLeadIntakeAuth, classifyWordPressLead } from "@/lib/orion-auth";
import { isTestLead, leadFromOrion } from "@/lib/leads/normalize";
import { errorCode, intakeLead } from "@/lib/leads/record-lead";

// Lead intake from ORION, the marketing platform. Every quote request it receives — the website
// form, the site's chat concierge, a Facebook instant form — is posted here. What happens to the
// lead is the same for every door (src/lib/leads/record-lead.ts): a row in the Leads Inbox and a
// card in the sales pipeline, so nobody retypes it.
//
// Server-to-server bearer authentication and the WordPress key's scope are in src/lib/orion-auth.ts.
// Accepts JSON or form fields (application/x-www-form-urlencoded), so a Make HTTP module can send
// plain key/value fields without hand-building JSON.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LeadInput = z.object({
  leadId: z.string().min(1).max(191),
  source: z.enum(["Website", "Meta", "Concierge", "Google"]),
  // Any date the platforms send ("2026-10-16T15:44:26+0000" from Meta via Make, ISO from ORION);
  // missing means "now".
  receivedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "not a date")
    .optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  zipCode: z.string().trim().max(20).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(5000).optional(),
  // Any other answers from the form, label → value, kept on the lead's first note.
  details: z.record(z.string().max(5000)).optional(),
});
type LeadInput = z.infer<typeof LeadInput>;

const KNOWN_FIELDS = new Set(["leadId", "source", "receivedAt", "name", "email", "phone", "address", "city", "state", "zipCode", "service", "message", "details"]);

// The owner's Make scenario already shapes each Facebook lead for Viktor ("Lead ID", "Created time",
// "Full name", "Phone", "Email", "Service", "Form ID", "Ad ID"). Accepting those names lets the CRM
// step be a copy of the Viktor step with only the URL and key changed. Keys are compared without
// case, spaces, underscores or dashes.
const ALIASES: Record<string, string> = {
  leadid: "leadId",
  createdtime: "receivedAt",
  datecreated: "receivedAt",
  receivedat: "receivedAt",
  fullname: "name",
  name: "name",
  phone: "phone",
  phonenumber: "phone",
  email: "email",
  service: "service",
  servicetype: "service",
  city: "city",
  town: "city",
  state: "state",
  zip: "zipCode",
  zipcode: "zipCode",
  projectzipcode: "zipCode",
  postcode: "zipCode",
  streetaddress: "address",
  address: "address",
  message: "message",
  source: "source",
  details: "details",
};
// Fields only a Facebook lead carries — their presence means the source is Meta.
const META_ONLY = new Set(["formid", "adid"]);
const squash = (key: string) => key.toLowerCase().replace(/[\s_-]+/g, "");

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "").trim();
}

// Same lead, same key, whoever delivers it: ORION sends "meta:<leadgen id>", and a Make scenario
// that maps Facebook's bare lead id gets the same prefix here, so the two never make two leads.
function normalizeLeadId(leadId: string, source: string): string {
  const id = leadId.trim();
  if (/^\d+$/.test(id) && source === "Meta") return `meta:${id}`;
  if (/^\d+$/.test(id) && source === "Google") return `google:${id}`;
  return id;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const type = req.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> | null;
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    raw = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : null;
  } else {
    raw = await req.json().catch(() => null);
  }
  if (!raw || typeof raw !== "object") return null;
  // Automation tools send unmapped fields as "" — treat those as missing. Unknown fields (extra
  // form questions) are kept as details.
  const body: Record<string, unknown> = {};
  const details: Record<string, string> = {};
  let looksLikeFacebook = false;
  for (const [key, value] of Object.entries(raw)) {
    const field = KNOWN_FIELDS.has(key) ? key : ALIASES[squash(key)];
    if (field === "details" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) if (asText(v)) details[k] = asText(v);
      continue;
    }
    const text = asText(value);
    if (!text) continue;
    if (META_ONLY.has(squash(key))) looksLikeFacebook = true;
    if (field && field !== "details") body[field] = text;
    else details[key] = text;
  }
  if (!body.source && looksLikeFacebook) body.source = "Meta";
  if (Object.keys(details).length) body.details = details;
  if (typeof body.leadId === "string" && typeof body.source === "string") body.leadId = normalizeLeadId(body.leadId, body.source);
  return body;
}

export async function POST(req: Request) {
  const { result: auth, caller } = checkLeadIntakeAuth(req);
  if (auth === "unconfigured") {
    console.error("[api/orion/leads] no lead intake credential is configured");
    return NextResponse.json({ error: "ORION access is not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = LeadInput.safeParse(await readBody(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead", issues: parsed.error.issues }, { status: 400 });
  const lead = parsed.data;

  // WordPress has a distinct check ID. Meta's Lead Ads Testing Tool instead fills every field with
  // "<test lead: dummy data for …>"; answer those so the owner can check a Make connection end to
  // end, without a junk lead in the pipeline.
  if (caller === "WordPress") {
    const kind = classifyWordPressLead(lead);
    if (kind === "denied") return NextResponse.json({ error: "Outside WordPress quote scope" }, { status: 403 });
    if (kind === "check") return NextResponse.json({ status: "test_ok" });
  } else if (isTestLead(lead)) {
    return NextResponse.json({ status: "test_ok", message: "Connection works — test lead not saved." });
  }

  try {
    const { pipeline } = await intakeLead(leadFromOrion(lead), caller);
    if (pipeline.status === "created") {
      const { status, customerMatched, opportunityId, customerId } = pipeline;
      return NextResponse.json({ status, customerMatched, opportunityId, customerId }, { status: 201 });
    }
    return NextResponse.json({ status: "exists", opportunityId: pipeline.opportunityId, filled: pipeline.filled });
  } catch (err) {
    console.error("[api/orion/leads] intake failed", errorCode(err));
    return NextResponse.json({ error: "Lead intake failed" }, { status: 500 });
  }
}
