/**
 * In-memory fixed-window limiter for failed login attempts, keyed by
 * email + IP so employees sharing one network do not lock each other out.
 * No credentials, phones, or PINs are stored or logged — only attempt counts.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 5;

const failedAttempts = new Map<string, number[]>();

function keyFor(email: string, ip: string | null): string {
  return `${email.trim().toLowerCase()}|${ip ?? "unknown"}`;
}

function pruneWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
}

export function isLoginRateLimited(email: string, ip: string | null, now = Date.now()): boolean {
  const key = keyFor(email, ip);
  const recent = pruneWindow(failedAttempts.get(key) ?? [], now);
  failedAttempts.set(key, recent);
  return recent.length >= MAX_FAILURES_PER_WINDOW;
}

export function recordFailedLogin(email: string, ip: string | null, now = Date.now()): void {
  const key = keyFor(email, ip);
  const recent = pruneWindow(failedAttempts.get(key) ?? [], now);
  recent.push(now);
  failedAttempts.set(key, recent);
}

export function clearLoginFailures(email: string, ip: string | null): void {
  failedAttempts.delete(keyFor(email, ip));
}

/** Test-only: empty the limiter store. */
export function resetLoginRateLimitStore(): void {
  failedAttempts.clear();
}
