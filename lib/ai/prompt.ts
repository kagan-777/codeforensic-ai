// Builds what we send to Gemini. ONLY the finding and a small, redacted code
// window are sent — never the whole project.

import { redactSecrets } from "../utils/redact";
import type { Confidence, Language, Severity } from "../../types/scanner";

export interface FindingForAI {
  /** Rule that produced the finding (used to re-check the AI's suggested code). */
  ruleId?: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number;
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  codeSnippet: string;
  snippetStartLine: number;
  recommendation: string;
  language: Language | string;
}

export const SYSTEM_INSTRUCTION = `You are a cybersecurity education assistant.

Explain the provided static-analysis finding to a beginner developer.

You must ONLY reason from the supplied evidence and code context.
Do not invent vulnerabilities, file names, line numbers, code, or attack paths that are not supported by the evidence.
Do not claim a vulnerability is confirmed. The analyzer only detects PATTERNS.
Use terms such as "potential risk", "potential vulnerability pattern", or "the analyzer detected".
Do not say the code is safe or secure, and do not guarantee anything.
Parts of the code may show [REDACTED]; that is intentional masking of secrets. Never guess the hidden value.

Explain:
1. What was detected?
2. Why might it be risky?
3. What part of the code caused the finding?
4. What should the developer review?
5. What safer approach could be considered?
6. A safer version of the code shown.

Keep the explanation concise, technically accurate, and beginner-friendly (short sentences, explain jargon).
If the evidence is insufficient to judge the risk, explicitly say that manual review is required and set manual_review to true.

Respond ONLY with a JSON object with exactly these keys:
{
  "summary": "what the analyzer detected, 1-3 sentences",
  "why_risky": "why this pattern might be risky, 2-4 sentences",
  "evidence_explanation": "which part of the supplied code caused the finding and what to review, 1-4 sentences",
  "recommendation": "a safer approach that could be considered, 2-5 sentences",
  "fixed_code": "a safer version of the CODE CONTEXT lines (see rules below), or an empty string",
  "manual_review": true or false
}

Rules for "fixed_code":
- Return EVERY line shown in CODE CONTEXT, in the same order, including the unchanged ones, as plain code in the same language.
- Do NOT include line numbers, the ">>" marker, the "|" separator, or markdown fences.
- Keep lines that are unrelated to the finding exactly as they are (same text, same indentation).
- Change as little as possible to remove the risky pattern (e.g. use a parameterized query, read a secret from an environment variable).
- The code MUST keep working the same way. Never delete data the program needs. For example, never remove a token from a link that must be sent to a user, and never delete a feature just to hide a value.
- For logs that print a secret, token or password: remove only the sensitive value from the log message, or wrap a development-only log in a check such as if (process.env.NODE_ENV !== "production") { ... }.
- Never write a real-looking password, key or token. If a secret is needed, read it from an environment variable.
- If a safe fix cannot be written from the shown lines alone, return "" and set manual_review to true.`;

/** Adds line numbers so the model can refer to the exact line we reported. */
export function numberSnippet(snippet: string, startLine: number, highlight: number): string {
  return snippet
    .split("\n")
    .map((l, i) => {
      const n = startLine + i;
      return `${n === highlight ? ">>" : "  "} ${String(n).padStart(4)} | ${l}`;
    })
    .join("\n");
}

export function buildFindingPrompt(f: FindingForAI): string {
  // Snippets are already redacted when stored; redacting again is a cheap safety net.
  const code = redactSecrets(f.codeSnippet, { config: ["Properties", "ENV", "YAML", "Config"].includes(f.language) });
  return [
    "STATIC ANALYSIS FINDING (source of truth — do not change these facts):",
    `Title: ${f.title}`,
    `Rule description: ${f.description}`,
    `File: ${f.filePath}`,
    `Line: ${f.lineNumber}`,
    `Language: ${f.language}`,
    `Severity (rule-defined): ${f.severity}`,
    `Confidence (how strongly the pattern matched, NOT proof): ${f.confidence}`,
    `Evidence: ${f.evidence}`,
    `Default recommendation: ${f.recommendation}`,
    "",
    "CODE CONTEXT (the line marked >> is the reported line):",
    "```",
    numberSnippet(code, f.snippetStartLine, f.lineNumber),
    "```",
  ].join("\n");
}
