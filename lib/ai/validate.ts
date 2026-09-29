// Validates Gemini's answer BEFORE it is shown or saved.
// The AI explains; it must not invent facts or over-claim.

import type { FindingForAI } from "./prompt";
import type { Language } from "../../types/scanner";
import { scanFiles } from "../scanner/scanner";
import { redactSecrets } from "../utils/redact";
import { identifiers, isSensitiveName, stripStringsKeepInterpolations } from "../scanner/text-utils";

export interface AiExplanation {
  summary: string;
  whyRisky: string;
  evidenceExplanation: string;
  recommendation: string;
  manualReview: boolean;
  /** Safer version of the code window, or "" when no safe fix was suggested. */
  fixedCode: string;
  /** True if our own analyzer still detects the same rule in fixedCode. */
  fixStillFlagged: boolean;
  /** Sensitive-looking variables that the suggestion removed completely (the program may still need them). */
  fixRemovedNames: string[];
}

export type ValidationResult = { ok: true; value: AiExplanation } | { ok: false; reason: string };

const MAX_FIELD_LENGTH = 2500;

const OVERCLAIMS: RegExp[] = [
  /\bconfirmed\s+(?:vulnerabilit(?:y|ies)|sql\s+injection|injection|exploit|security\s+(?:issue|flaw|hole))/i,
  /\b(?:is|are)\s+(?:definitely|certainly|100%)\s+(?:vulnerable|exploitable|insecure)/i,
  /\b(?:100\s*%|completely|fully|totally)\s+(?:secure|safe)\b/i,
  /\bguarantee[sd]?\b/i,
  /\bis\s+now\s+secure\b/i,
];

/** True if the text over-claims — unless the claim is negated ("this is NOT a confirmed vulnerability"). */
export function findOverclaim(text: string): string | null {
  for (const re of OVERCLAIMS) {
    const m = re.exec(text);
    if (!m) continue;
    const before = text.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
    if (/\b(not|no|never|cannot|can't|isn't|aren't|without|nor)\b/.test(before)) continue;
    return m[0];
  }
  return null;
}

/** Every "line N" the AI mentions must be inside the code window we gave it. */
export function findInventedLine(text: string, minLine: number, maxLine: number): number | null {
  const re = /\blines?\s+(\d{1,6})(?:\s*(?:-|–|to|and|through)\s*(\d{1,6}))?/gi;
  for (const m of text.matchAll(re)) {
    for (const g of [m[1], m[2]]) {
      if (!g) continue;
      const n = Number(g);
      if (n < minLine || n > maxLine) return n;
    }
  }
  return null;
}

const FILE_NAME = /\b[\w-]+\.(?:java|jsx?|tsx?|mjs|cjs|py|sql|html?|json|ya?ml|properties)\b/gi;

/** File names in the evidence explanation must be the real file (or appear in the code). */
export function findInventedFile(text: string, filePath: string, code: string): string | null {
  const base = filePath.split("/").pop()?.toLowerCase() ?? "";
  for (const m of text.matchAll(FILE_NAME)) {
    const name = m[0].toLowerCase();
    if (name === base || filePath.toLowerCase().includes(name) || code.toLowerCase().includes(name)) continue;
    return m[0];
  }
  return null;
}

function stripCodeFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1] : t;
}

const MAX_FIX_LENGTH = 6000;
const KNOWN_LANGUAGES: readonly Language[] = [
  "Java", "JavaScript", "TypeScript", "Python", "SQL", "HTML", "JSON", "YAML", "Properties", "ENV", "Config",
];

/** Removes things the model sometimes adds by mistake: ``` fences and "  12 | " line-number gutters. */
export function cleanFixedCode(raw: string): string {
  let code = raw.replace(/\r\n/g, "\n");
  const fence = /^\s*```[\w-]*\n([\s\S]*?)\n?```\s*$/.exec(code);
  if (fence) code = fence[1];
  const lines = code.split("\n");
  const gutter = /^(?:>>|  )?\s*\d+\s\|\s?/;
  if (lines.length > 0 && lines.filter((l) => l.trim()).every((l) => gutter.test(l))) {
    code = lines.map((l) => l.replace(gutter, "")).join("\n");
  }
  return code.replace(/\s+$/, "");
}

/**
 * The AI is asked to return the WHOLE code window, but sometimes it returns only
 * the changed line(s). In that case we put its lines in place of the reported
 * line, so the suggestion always lines up with the real file.
 */
export function mergeIntoWindow(original: string, fixed: string, reportedIndex: number): string {
  const orig = original.split("\n");
  const fix = fixed.split("\n");
  const looksLikeWholeWindow = fix.length >= Math.max(2, Math.ceil(orig.length * 0.6));
  if (looksLikeWholeWindow) return fixed;
  if (reportedIndex < 0 || reportedIndex >= orig.length) return fixed;
  // Keep the original indentation if the AI dropped it.
  const indent = /^\s*/.exec(orig[reportedIndex])?.[0] ?? "";
  const replacement = fix.map((l) => (l.trim() && !/^\s/.test(l) ? indent + l : l));
  return [...orig.slice(0, reportedIndex), ...replacement, ...orig.slice(reportedIndex + 1)].join("\n");
}

/**
 * Checks the AI's suggested code. Returns "" (no suggestion shown) if it is unusable:
 * too long, identical to the original, or it contains a hard-coded secret.
 */
/** Sensitive-looking variable names used in `before` that no longer appear anywhere in `after`. */
export function removedSensitiveNames(before: string, after: string): string[] {
  const names = (code: string) =>
    new Set(identifiers(stripStringsKeepInterpolations(code)).flatMap((id) => id.split(".")));
  const inAfter = names(after);
  return [...names(before)].filter((n) => isSensitiveName(n) && !inAfter.has(n));
}

export function checkFixedCode(
  raw: unknown,
  finding: FindingForAI,
): { code: string; stillFlagged: boolean; removedNames: string[] } {
  const none = { code: "", stillFlagged: false, removedNames: [] as string[] };
  if (typeof raw !== "string") return none;
  const cleaned = cleanFixedCode(raw);
  if (!cleaned.trim() || cleaned.length > MAX_FIX_LENGTH) return none;
  const code = mergeIntoWindow(finding.codeSnippet, cleaned, finding.lineNumber - finding.snippetStartLine);
  if (code.trim() === finding.codeSnippet.trim()) return none;

  const language = KNOWN_LANGUAGES.find((l) => l === finding.language);
  const config = language === "Properties" || language === "ENV" || language === "YAML" || language === "Config";
  // If our redaction would change it, the suggestion contains a secret-looking value: never show it.
  if (redactSecrets(code, { config }) !== code) return none;

  // Run OUR static analyzer on the suggestion: does the same rule still trigger?
  let stillFlagged = false;
  if (language && finding.ruleId) {
    const { findings } = scanFiles([{ path: finding.filePath, language, content: code }]);
    const family = finding.ruleId.split("-")[0];
    stillFlagged = findings.some((f) => f.ruleId === finding.ruleId || (family === "CONFIG" && f.ruleId.startsWith("CONFIG")));
  }
  return { code, stillFlagged, removedNames: removedSensitiveNames(finding.codeSnippet, code) };
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > MAX_FIELD_LENGTH) return null;
  return t;
}

export function validateExplanation(raw: string, finding: FindingForAI): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, reason: "Response was not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "Response was not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;

  const summary = readString(obj, "summary");
  const whyRisky = readString(obj, "why_risky");
  const evidenceExplanation = readString(obj, "evidence_explanation");
  const recommendation = readString(obj, "recommendation");
  if (!summary || !whyRisky || !evidenceExplanation || !recommendation) {
    return { ok: false, reason: "Response is missing required text fields" };
  }
  const manualReview = obj.manual_review;
  if (typeof manualReview !== "boolean") {
    return { ok: false, reason: "manual_review must be true or false" };
  }

  const all = [summary, whyRisky, evidenceExplanation, recommendation].join("\n");
  const over = findOverclaim(all);
  if (over) return { ok: false, reason: `Response over-claims certainty ("${over}")` };

  const snippetLines = finding.codeSnippet.split("\n").length;
  const line = findInventedLine(all, finding.snippetStartLine, finding.snippetStartLine + snippetLines - 1);
  if (line !== null) return { ok: false, reason: `Response mentions line ${line}, which is outside the analyzed code` };

  const file = findInventedFile(evidenceExplanation + "\n" + summary, finding.filePath, finding.codeSnippet);
  if (file) return { ok: false, reason: `Response mentions a file (${file}) that is not part of the finding` };

  const fix = checkFixedCode(obj.fixed_code, finding);

  return {
    ok: true,
    value: {
      summary,
      whyRisky,
      evidenceExplanation,
      recommendation,
      // Low-confidence matches, and suggestions our analyzer still flags, always need a human to look.
      manualReview: manualReview || finding.confidence === "LOW" || fix.stillFlagged,
      fixedCode: fix.code,
      fixStillFlagged: fix.stillFlagged,
      fixRemovedNames: fix.removedNames,
    },
  };
}
