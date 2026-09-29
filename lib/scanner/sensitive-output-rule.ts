// RULE 4 — Potential Sensitive Information Exposure
// Flags print/log statements that output a variable whose name suggests
// sensitive data (password, token, secret, apiKey…).

import type { Language, RuleMatch, SecurityRule, SourceFile } from "../../types/scanner";
import { identifiers, isCommentLine, isSensitiveName, shorten, stripStringsKeepInterpolations } from "./text-utils";

const OUTPUT_CALLS: { languages: readonly Language[]; regex: RegExp }[] = [
  { languages: ["JavaScript", "TypeScript", "HTML"], regex: /\bconsole\s*\.\s*(?:log|info|debug|warn|error|trace)\s*\(/ },
  { languages: ["JavaScript", "TypeScript", "HTML"], regex: /(?<![\w$.])(?:alert|document\s*\.\s*write)\s*\(/ },
  { languages: ["Python"], regex: /(?<![\w.])print\s*\(/ },
  { languages: ["Python"], regex: /\b(?:logging|logger|log)\s*\.\s*(?:debug|info|warning|warn|error|critical|exception)\s*\(/ },
  { languages: ["Java"], regex: /\bSystem\s*\.\s*(?:out|err)\s*\.\s*(?:println|print|printf|format)\s*\(/ },
  { languages: ["Java", "JavaScript", "TypeScript"], regex: /\b(?:logger|log|LOGGER|LOG)\s*\.\s*(?:trace|debug|info|warn|warning|error|fatal)\s*\(/ },
];

/** Returns the text between the opening "(" (at openIdx - 1) and its matching ")". */
function argumentText(line: string, openIdx: number): string {
  let depth = 1;
  for (let i = openIdx; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") {
      depth--;
      if (depth === 0) return line.slice(openIdx, i);
    }
  }
  return line.slice(openIdx);
}

export const sensitiveOutputRule: SecurityRule = {
  id: "EXPOSE-001",
  title: "Potential Sensitive Information Exposure",
  description:
    "The code appears to print or log a variable that may contain sensitive information such as a password, token or secret. Logs and console output are often stored, shared or visible to people who should not see these values.",
  severity: "MEDIUM",
  recommendation:
    "Avoid logging secrets, passwords, tokens, or other sensitive information. Log a non-sensitive message instead (for example \"login attempt for user X\"), or mask the value.",
  languages: ["Java", "JavaScript", "TypeScript", "Python", "HTML"],

  check(file: SourceFile, lines: string[]): RuleMatch[] {
    const matches: RuleMatch[] = [];

    lines.forEach((line, idx) => {
      if (isCommentLine(line, file.language)) return;
      // Blank out string contents (keeping ${x} / {x} interpolations) so that
      // console.log("Enter your password") is NOT flagged, but
      // console.log("pw: " + password) and print(f"{password}") are.
      const code = stripStringsKeepInterpolations(line);

      for (const call of OUTPUT_CALLS) {
        if (!call.languages.includes(file.language)) continue;
        const m = call.regex.exec(code);
        if (!m) continue;

        const args = argumentText(code, m.index + m[0].length);
        const hit = identifiers(args).find((id) => {
          const last = id.split(".").pop() ?? id;
          return isSensitiveName(last);
        });
        if (!hit) continue;

        const last = hit.split(".").pop() ?? hit;
        const exact = /^(password|passwd|pwd|secret|token|apikey|api_key|accesstoken|access_token|secretkey|secret_key)$/i.test(last);
        matches.push({
          lineNumber: idx + 1,
          confidence: exact ? "HIGH" : "MEDIUM",
          evidence: `The code appears to output the variable "${hit}", whose name suggests sensitive data: ${shorten(line, 100)}`,
        });
        return;
      }
    });
    return matches;
  },
};
