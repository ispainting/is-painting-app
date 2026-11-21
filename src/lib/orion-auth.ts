import { timingSafeEqual } from "node:crypto";

// Bearer checks for the server-to-server routes under /api/orion. Those paths are public in
// src/middleware.ts because their callers have no session cookie, so every handler must call one of
// these first. Both fail closed when no secret is configured.
//
// One key per caller, so each can be cut off on its own by deleting its env var:
// - ORION_API_SECRET: ORION, the marketing platform (ispainting-platform). Full access — it reads
//   the summary and posts leads.
// - VIKTOR_API_SECRET: the owner's Viktor assistant (added 2026-10-17). Read-only — summary only,
//   never lead intake.
// - MAKE_API_SECRET: the owner's Make scenario that forwards Facebook leads the moment they arrive
//   (added 2026-10-17). Lead intake only — it can't read the summary.
// - WORDPRESS_LEADS_SECRET: quote requests from the Coastal WordPress form and its connection check.

type AuthResult = "ok" | "denied" | "unconfigured";
export type LeadIntakeCaller = "ORION" | "Make" | "WordPress";

// Tolerates how the key was typed into a tool's header field: "bearer" in any case, extra spaces
// after it, or a stray space after the key.
function bearer(req: Request): Buffer {
  const match = (req.headers.get("authorization") ?? "").match(/^\s*bearer\s+(\S+)\s*$/i);
  return Buffer.from(match ? match[1] : "");
}

function matches(given: Buffer, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Full access: ORION's key only. Use for anything that writes. */
export function checkOrionAuth(req: Request): AuthResult {
  if (!process.env.ORION_API_SECRET) return "unconfigured";
  return matches(bearer(req), process.env.ORION_API_SECRET) ? "ok" : "denied";
}

/** Read access: ORION's key or the read-only Viktor key. Use for routes that only read totals. */
export function checkReadAuth(req: Request): AuthResult {
  const keys = [process.env.ORION_API_SECRET, process.env.VIKTOR_API_SECRET].filter(Boolean);
  if (keys.length === 0) return "unconfigured";
  const given = bearer(req);
  return keys.some((key) => matches(given, key)) ? "ok" : "denied";
}

/** Identifies the intake caller so the route can enforce its scope and record the sender. */
export function checkLeadIntakeAuth(req: Request): { result: AuthResult; caller: LeadIntakeCaller | null } {
  if (!process.env.ORION_API_SECRET && !process.env.MAKE_API_SECRET && !process.env.WORDPRESS_LEADS_SECRET) {
    return { result: "unconfigured", caller: null };
  }
  const given = bearer(req);
  if (matches(given, process.env.ORION_API_SECRET)) return { result: "ok", caller: "ORION" };
  if (matches(given, process.env.MAKE_API_SECRET)) return { result: "ok", caller: "Make" };
  if (matches(given, process.env.WORDPRESS_LEADS_SECRET)) return { result: "ok", caller: "WordPress" };
  return { result: "denied", caller: null };
}

// The plugin uses coastal:<uuid4> for quotes and check:<uuid4> for its admin connection test.
// The same lead ID is the database deduplication key across all callers.
export function classifyWordPressLead(lead: { source: string; leadId: string; name?: string; phone?: string }): "quote" | "check" | "denied" {
  const id = /^(coastal|check):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(lead.leadId);
  if (lead.source !== "Website" || !id) return "denied";
  if (id[1] === "check") return lead.name === "Test lead" ? "check" : "denied";
  return lead.name && lead.phone ? "quote" : "denied";
}
