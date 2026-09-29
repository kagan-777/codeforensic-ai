// Tiny in-memory rate limiter (per server instance). Good enough for an MVP to
// stop accidental floods; a multi-server deployment would need a shared store.

const buckets = new Map<string, number[]>();

/** Returns true if the action is allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
