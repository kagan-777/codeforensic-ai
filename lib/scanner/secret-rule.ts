// RULE 1 — Potential Hardcoded Secret
// Looks for string values assigned to variables/keys whose NAME suggests a
// secret (password, apiKey, token…), plus a few well-known credential formats.

import type { Confidence, Language, RuleMatch, SecurityRule, SourceFile } from "../../types/scanner";
import { basename } from "./file-detector";
import { KNOWN_SECRET_PATTERNS } from "../utils/redact";
import { isCommentLine, isSensitiveName } from "./text-utils";

const CODE_LANGUAGES: readonly Language[] = ["Java", "JavaScript", "TypeScript", "Python", "HTML", "JSON"];
const CONFIG_LANGUAGES: readonly Language[] = ["Properties", "ENV", "YAML", "Config"];

const PLACEHOLDER_EXACT = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "api-key",
  "test",
  "testing",
  "example",
  "sample",
  "placeholder",
  "dummy",
  "fake",
  "none",
  "null",
  "nil",
  "undefined",
  "true",
  "false",
  "todo",
  "tbd",
  "xxx",
  "string",
]);

const PLACEHOLDER_PARTS = [
  "example",
  "placeholder",
  "your-",
  "your_",
  "yourapi",
  "your api",
  "<",
  "{{",
  "%s",
  "process.env",
  "xxxx",
  "****",
  "...",
  "replace",
  "insert",
  "enter ",
  "redacted",
];

/** Returns true if the value is clearly NOT a real secret. */
export function isPlaceholderValue(value: string, name?: string): boolean {
  const v = value.trim();
  const lower = v.toLowerCase();
  if (v.length < 4) return true;
  if (PLACEHOLDER_EXACT.has(lower)) return true;
  if (name && lower === name.toLowerCase()) return true;
  if (PLACEHOLDER_PARTS.some((p) => lower.includes(p))) return true;
  if (v.startsWith("$") || /^(env|enc)\(/i.test(v)) return true; // env reference / encrypted value
  if (v.split(/\s+/).length >= 3) return true; // looks like a sentence / UI text
  if (/^https?:\/\/[^@\s]*$/i.test(v)) return true; // plain URL without credentials
  return false;
}

function charClasses(v: string): number {
  let n = 0;
  if (/[a-z]/.test(v)) n++;
  if (/[A-Z]/.test(v)) n++;
  if (/[0-9]/.test(v)) n++;
  if (/[^A-Za-z0-9]/.test(v)) n++;
  return n;
}

function confidenceFor(value: string): Confidence {
  return value.length >= 8 && charClasses(value) >= 2 ? "HIGH" : "MEDIUM";
}

const QUOTED = /(["']?)([A-Za-z_$][\w$.-]*)\1\s*(?::=|=|:)\s*(["'`])((?:\\.|(?!\3).)*)\3/g;
const UNQUOTED_CONFIG = /^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*[=:]\s*(?!["'`])(\S.*)$/;

export const secretRule: SecurityRule = {
  id: "SECRET-001",
  title: "Potential Hardcoded Secret",
  description:
    "A value that looks like a password, API key, token or other secret appears to be written directly in the source code or configuration.",
  severity: "HIGH",
  recommendation:
    "Move secrets into secure environment variables or a secret-management system and avoid committing real credentials to source control. If this value was real, consider it exposed and rotate (change) it.",
  languages: [...CODE_LANGUAGES, ...CONFIG_LANGUAGES],

  check(file: SourceFile, lines: string[]): RuleMatch[] {
    const name = basename(file.path).toLowerCase();
    // Example/template files are meant to contain fake values.
    if (/(example|sample|template|\.dist)/.test(name)) return [];

    const matches: RuleMatch[] = [];
    const isConfig = CONFIG_LANGUAGES.includes(file.language);

    lines.forEach((line, idx) => {
      if (isCommentLine(line, file.language)) return;
      const lineNumber = idx + 1;

      // 1) Known credential formats (strongest signal).
      for (const { name: kind, regex } of KNOWN_SECRET_PATTERNS) {
        if (new RegExp(regex.source).test(line)) {
          matches.push({
            lineNumber,
            confidence: "HIGH",
            evidence: `This line contains a value that matches the known format of a ${kind}. The value itself is hidden in this report.`,
          });
          return;
        }
      }

      // 2) name = "value" (code, JSON, quoted config values)
      for (const m of line.matchAll(new RegExp(QUOTED.source, "g"))) {
        const varName = m[2];
        const value = m[4];
        if (!isSensitiveName(varName) || isPlaceholderValue(value, varName)) continue;
        matches.push({
          lineNumber,
          confidence: confidenceFor(value),
          evidence: `The name "${varName}" suggests a secret, and it is assigned a hardcoded string literal (${value.length} characters). The value itself is hidden in this report.`,
        });
        return;
      }

      // 3) name=value without quotes (.env, .properties, YAML, ini)
      if (isConfig) {
        const m = UNQUOTED_CONFIG.exec(line);
        // A "#" only starts a comment when it follows whitespace (so "Pa#ss" stays intact).
        const value = m ? m[2].replace(/\s+[#;].*$/, "").trim() : "";
        if (m && isSensitiveName(m[1]) && !isPlaceholderValue(value, m[1])) {
          matches.push({
            lineNumber,
            confidence: confidenceFor(value),
            evidence: `The configuration key "${m[1]}" suggests a secret, and it has a literal value (${value.length} characters) instead of a reference to an environment variable. The value itself is hidden in this report.`,
          });
        }
      }
    });
    return matches;
  },
};
