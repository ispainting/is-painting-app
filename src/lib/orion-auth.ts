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

type AuthResult = "ok" | "denied" | "unconfigured";

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

/** Lead intake: ORION's key or the Make key. Says which one, so the lead records who sent it. */
export function checkLeadIntakeAuth(req: Request): { result: AuthResult; caller: "ORION" | "Make" | null } {
  if (!process.env.ORION_API_SECRET && !process.env.MAKE_API_SECRET) return { result: "unconfigured", caller: null };
  const given = bearer(req);
  if (matches(given, process.env.ORION_API_SECRET)) return { result: "ok", caller: "ORION" };
  if (matches(given, process.env.MAKE_API_SECRET)) return { result: "ok", caller: "Make" };
  return { result: "denied", caller: null };
}
