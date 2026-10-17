import { timingSafeEqual } from "node:crypto";

// Bearer checks for the server-to-server routes under /api/orion. Those paths are public in
// src/middleware.ts because their callers have no session cookie, so every handler must call one of
// these first. Both fail closed when no secret is configured.
//
// Two keys, so each caller can be cut off on its own:
// - ORION_API_SECRET: ORION, the marketing platform (ispainting-platform). Full access — it reads
//   the summary and posts leads.
// - VIKTOR_API_SECRET: the owner's Viktor assistant (added 2026-10-17). Read-only — summary only,
//   never lead intake.

type AuthResult = "ok" | "denied" | "unconfigured";

function bearer(req: Request): Buffer {
  const header = req.headers.get("authorization") ?? "";
  return Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
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
