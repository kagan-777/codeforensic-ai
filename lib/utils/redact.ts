// Masks obvious secret values before code is stored or sent to the AI.
//   API_KEY="real-secret"   ->   API_KEY="[REDACTED]"
// This is best-effort: it catches common patterns, not every possible secret.

import { isSensitiveName } from "../scanner/text-utils";

export const REDACTED = "[REDACTED]";

/** Well-known credential formats that are secrets no matter the variable name. */
export const KNOWN_SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "AWS access key ID", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "Slack token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Stripe live secret key", regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  { name: "Private key block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
];

// name = "value"  |  name: 'value'  |  "name": "value"
const QUOTED_ASSIGNMENT =
  /(["']?)([A-Za-z_$][\w$.-]*)\1(\s*(?::=|=|:)\s*)(["'`])((?:\\.|(?!\4).)*)\4/g;
// Unquoted config values: name=value / name: value  (whole line)
const CONFIG_LINE = /^(\s*(?:export\s+)?)([A-Za-z_][\w.-]*)(\s*[=:]\s*)(?!["'`])(\S.*)$/;

function redactLine(line: string, config: boolean): string {
  let out = line;
  for (const { regex } of KNOWN_SECRET_PATTERNS) {
    out = out.replace(regex, REDACTED);
  }
  out = out.replace(QUOTED_ASSIGNMENT, (whole, q: string, name: string, sep: string, quote: string, value: string) => {
    if (!isSensitiveName(name) || value.length === 0 || value === REDACTED) return whole;
    return `${q}${name}${q}${sep}${quote}${REDACTED}${quote}`;
  });
  if (!config) return out;
  const m = CONFIG_LINE.exec(out);
  if (m &&isSensitiveName(m[2]) && !m[4].includes(REDACTED)) {
    const value = m[4].trim();
    // Leave references like ${DB_PASSWORD} or $SECRET alone — they're not secrets.
    if (!/^\$\{?[\w.]+\}?$/.test(value)) out = `${m[1]}${m[2]}${m[3]}${REDACTED}`;
  }
  return out;
}

/**
 * @param options.config  true for config files (.env, .properties, YAML…), where
 *                        values are usually unquoted: `DB_PASSWORD=hunter2`.
 */
export function redactSecrets(text: string, options: { config?: boolean } = {}): string {
  const config = options.config ?? false;
  return text
    .split("\n")
    .map((l) => redactLine(l, config))
    .join("\n");
}
