// Reads a stored/returned AI explanation safely, whatever shape it arrives in
// (object, JSON string, camelCase or snake_case keys). Browser-safe.

import type { StoredExplanation } from "../../types/database";

function str(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Returns null if there is no usable explanation (so the UI can generate one). */
export function normalizeExplanation(raw: unknown): StoredExplanation | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;

  const e: StoredExplanation = {
    summary: str(o, "summary"),
    whyRisky: str(o, "whyRisky", "why_risky"),
    evidenceExplanation: str(o, "evidenceExplanation", "evidence_explanation"),
    recommendation: str(o, "recommendation"),
    manualReview: o.manualReview === true || o.manual_review === true,
    fixedCode: typeof o.fixedCode === "string" ? o.fixedCode : typeof o.fixed_code === "string" ? o.fixed_code : undefined,
    fixStillFlagged: o.fixStillFlagged === true,
    fixRemovedNames: Array.isArray(o.fixRemovedNames)
      ? o.fixRemovedNames.filter((n): n is string => typeof n === "string").slice(0, 10)
      : [],
  };
  if (!e.summary && !e.whyRisky && !e.evidenceExplanation && !e.recommendation) return null;
  return e;
}
