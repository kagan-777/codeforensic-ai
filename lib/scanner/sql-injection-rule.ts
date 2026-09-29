// RULE 2 — Potential SQL Injection Pattern
// Flags SQL query strings that are glued together with variables
// (string concatenation, template literals, f-strings, % / .format / String.format)
// instead of using parameterized queries.

import type { Confidence, RuleMatch, SecurityRule, SourceFile } from "../../types/scanner";
import { isCommentLine, shorten, splitName } from "./text-utils";

const SQL_IN_STRING =
  /\b(select\s+(?:distinct\s+)?[\w.*,\s`"()]+?\s+from(?:\s+[\w.`"[]|\s*$)|insert\s+into\b|update\s+[\w.`"[\]]+\s+set\b|delete\s+from\b)/i;

/** English sentences like "select a file from disk" are not SQL: require SQL-looking structure. */
function looksLikeSql(body: string): boolean {
  if (!SQL_IN_STRING.test(body)) return false;
  if (/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(body)) return true; // uppercase keyword
  return /(\*|\bwhere\b|\bjoin\b|\bvalues\b|\bset\b|=|\border\s+by\b|\blimit\b)/i.test(body);
}
const STRING_LITERAL = /([fFrRbBuU]{0,2})(["'`])((?:\\.|(?!\2)[\s\S])*)\2/g;
const PLACEHOLDER = "__STR__";

/** Words that hint the value may come from a user. */
const INPUT_WORDS = new Set([
  "id", "user", "username", "name", "input", "param", "params", "query", "search", "email",
  "term", "filter", "value", "arg", "args", "req", "request", "body", "form", "data",
  "keyword", "text", "login", "pass", "password", "order", "sort", "category", "q",
]);
const DIRECT_INPUT =
  /(getParameter\s*\(|req\.(query|body|params)|request\.(args|form|GET|POST|values|json)|\binput\s*\(|argv)/;

interface Concat {
  kind: string;
  variable: string;
}

function findConcatenation(windowText: string): Concat | null {
  const literals: { prefix: string; quote: string; body: string }[] = [];
  const stripped = windowText.replace(new RegExp(STRING_LITERAL.source, "g"), (_m, prefix: string, quote: string, body: string) => {
    literals.push({ prefix, quote, body });
    return PLACEHOLDER;
  });

  const sqlLiterals = literals.filter((l) => looksLikeSql(l.body));
  if (sqlLiterals.length === 0) return null;

  // Template literal:  `SELECT ... ${userId}`
  for (const l of sqlLiterals) {
    if (l.quote === "`") {
      const m = /\$\{([^}]+)\}/.exec(l.body);
      if (m) return { kind: "a template literal (${...})", variable: m[1].trim() };
    }
    // Python f-string:  f"SELECT ... {user_id}"
    if (/f/i.test(l.prefix)) {
      const m = /\{([^{}]+)\}/.exec(l.body);
      if (m) return { kind: "a Python f-string", variable: m[1].trim() };
    }
  }

  // String concatenation with +
  const ident = String.raw`[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\([^()]*\)|\[[^\]]*\])*`;
  const after = new RegExp(`${PLACEHOLDER}\\s*\\+\\s*(${ident})`).exec(stripped);
  if (after && !after[1].startsWith(PLACEHOLDER)) return { kind: "string concatenation (+)", variable: after[1] };
  const before = new RegExp(`(${ident})\\s*\\+\\s*${PLACEHOLDER}`).exec(stripped);
  if (before && !before[1].startsWith(PLACEHOLDER)) return { kind: "string concatenation (+)", variable: before[1] };

  // Python % formatting:  "SELECT ... %s" % user_id
  const percent = new RegExp(`${PLACEHOLDER}\\s*%\\s*\\(?\\s*(${ident})`).exec(stripped);
  if (percent) return { kind: "Python % string formatting", variable: percent[1] };

  // "...".format(x)
  const fmt = new RegExp(`${PLACEHOLDER}\\s*\\.\\s*format\\s*\\(\\s*(${ident})`).exec(stripped);
  if (fmt) return { kind: "str.format()", variable: fmt[1] };

  // String.format("SELECT ... %s", x)
  const jfmt = new RegExp(`String\\s*\\.\\s*format\\s*\\(\\s*${PLACEHOLDER}\\s*,\\s*(${ident})`).exec(stripped);
  if (jfmt) return { kind: "String.format()", variable: jfmt[1] };

  return null;
}

function confidenceFor(variable: string, windowText: string): Confidence {
  const bare = variable.replace(/\s+/g, "");
  if (/^[A-Z][A-Z0-9_]*$/.test(bare)) return "LOW"; // looks like a constant
  if (DIRECT_INPUT.test(bare) || DIRECT_INPUT.test(windowText)) return "HIGH";
  if (splitName(bare).some((w) => INPUT_WORDS.has(w))) return "HIGH";
  return "MEDIUM";
}

function firstSqlLiteral(windowText: string): string {
  const m = new RegExp(STRING_LITERAL.source, "g");
  for (const x of windowText.matchAll(m)) {
    if (looksLikeSql(x[3])) return shorten(x[3], 70);
  }
  return "";
}

export const sqlInjectionRule: SecurityRule = {
  id: "SQLI-001",
  title: "Potential SQL Injection Pattern",
  description:
    "A SQL query appears to be built by inserting a variable directly into the query text. If that variable can be influenced by a user, the database might interpret part of it as SQL commands.",
  severity: "HIGH",
  recommendation:
    "Consider parameterized queries / prepared statements (for example `PreparedStatement` with `?` in Java, placeholders in your database library for JavaScript/Python) and validate input where appropriate.",
  languages: ["Java", "JavaScript", "TypeScript", "Python"],

  check(file: SourceFile, lines: string[]): RuleMatch[] {
    const matches: RuleMatch[] = [];
    let skipUntil = -1;

    for (let i = 0; i < lines.length; i++) {
      if (i <= skipUntil) continue;
      const line = lines[i];
      if (isCommentLine(line, file.language)) continue;
      if (!/select|insert|update|delete/i.test(line)) continue;

      // Join continuation lines: `"SELECT ... id=" +` / `+ userId;`
      let end = i;
      while (
        end < lines.length - 1 &&
        end - i < 4 &&
        (lines[end].trimEnd().endsWith("+") || lines[end + 1].trim().startsWith("+"))
      ) {
        end++;
      }
      const windowText = lines.slice(i, end + 1).join("\n");
      const concat = findConcatenation(windowText);
      if (!concat) continue;

      const query = firstSqlLiteral(windowText);
      matches.push({
        lineNumber: i + 1,
        confidence: confidenceFor(concat.variable, windowText),
        evidence: `The SQL query "${query}" is built using ${concat.kind} with "${shorten(concat.variable, 60)}". If "${shorten(concat.variable, 60)}" can be influenced by a user, it could change the meaning of the query.`,
      });
      skipUntil = end;
    }
    return matches;
  },
};
