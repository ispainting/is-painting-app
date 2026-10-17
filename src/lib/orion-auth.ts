import { timingSafeEqual } from "node:crypto";

// Shared bearer check for the server-to-server routes ORION (the marketing platform,
// ispainting-platform) calls under /api/orion. Those paths are public in src/middleware.ts because
// ORION has no session cookie, so every handler must call this first. Fails closed when the
// secret isn't set.
export function checkOrionAuth(req: Request): "ok" | "denied" | "unconfigured" {
  const secret = process.env.ORION_API_SECRET;
  if (!secret) return "unconfigured";
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "denied";
}
