// Small text helpers shared by the security rules.

import type { Language } from "../../types/scanner";

/** Words that suggest a variable holds a secret. */
const SENSITIVE_KEYWORDS = [
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "secret",
  "apikey",
  "api_key",
  "api-key",
  "accesskey",
  "access_key",
  "privatekey",
  "private_key",
  "token",
  "credential",
  "credentials",
  "authkey",
  "auth_key",
  "clientsecret",
  "client_secret",
];

/**
 * Parts of a name that mean "this is ABOUT a secret, not the secret itself",
 * e.g. passwordLabel, token_url, maxPasswordLength, passwordField.
 */
const NON_SECRET_PARTS = [
  "label",
  "hint",
  "placeholder",
  "field",
  "input",
  "message",
  "msg",
  "prompt",
  "text",
  "title",
  "url",
  "uri",
  "endpoint",
  "path",
  "length",
  "len",
  "min",
  "max",
  "regex",
  "pattern",
  "policy",
  "type",
  "count",
  "expiry",
  "expires",
  "expiration",
  "ttl",
  "header",
  "name",
  "enabled",
  "required",
  "reset",
  "encoder",
  "hash",
  "hashed",
  "validator",
  "error",
  "class",
  "selector",
  "id",
];

/** Splits camelCase / snake_case / kebab-case / dotted names into lowercase words. */
export function splitName(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_.\-$]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** True if a variable/key name looks like it stores a secret value. */
export function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase();
  const words = splitName(name);
  const joined = words.join("");
  const hasKeyword = SENSITIVE_KEYWORDS.some((k) => {
    const flat = k.replace(/[_-]/g, "");
    return words.includes(flat) || joined.endsWith(flat) || lower.endsWith(k);
  });
  if (!hasKeyword) return false;
  // "tokenizer", "tokens" etc. are not secrets.
  if (words.some((w) => w === "tokenizer" || w === "tokens" || w === "tokenize")) return false;
  if (words.some((w) => NON_SECRET_PARTS.includes(w))) return false;
  return true;
}

/** True if the line is only a comment (so we can ignore it). */
export function isCommentLine(line: string, language: Language): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  switch (language) {
    case "Python":
    case "YAML":
    case "ENV":
    case "Config":
      return t.startsWith("#") || t.startsWith(";");
    case "Properties":
      return t.startsWith("#") || t.startsWith("!");
    case "SQL":
      return t.startsWith("--") || t.startsWith("/*") || t.startsWith("*");
    case "HTML":
      return t.startsWith("<!--");
    case "JSON":
      return t.startsWith("//");
    default:
      return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
  }
}

/**
 * Replaces the contents of string literals with spaces, but keeps
 * interpolations like ${x} (JS template strings) and {x} (Python f-strings),
 * so identifiers used inside them are still visible to the rules.
 */
export function stripStringsKeepInterpolations(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    const isFString = (ch === '"' || ch === "'") && i > 0 && /[fF]/.test(line[i - 1]) && !/\w/.test(line[i - 2] ?? "");
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += " ";
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        const tplStart = quote === "`" && line[i] === "$" && line[i + 1] === "{";
        const fStart = isFString && line[i] === "{" && line[i + 1] !== "{";
        if (tplStart || fStart) {
          const start = tplStart ? i + 2 : i + 1;
          const end = line.indexOf("}", start);
          if (end === -1) break;
          // Keep the output the same length as the input so column positions still line up.
          out += (tplStart ? "  " : " ") + line.slice(start, end) + " ";
          i = end + 1;
          continue;
        }
        out += " ";
        i++;
      }
      out += " ";
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Extracts identifier-like tokens (including dotted access like req.body.password). */
export function identifiers(code: string): string[] {
  return code.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) ?? [];
}

/** Short, single-line, trimmed version of code for evidence text. */
export function shorten(code: string, max = 120): string {
  const t = code.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
