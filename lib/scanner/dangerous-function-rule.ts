// RULE 3 — Potentially Dangerous Function Usage
// A focused list of functions that run code or operating-system commands
// dynamically. They are not always wrong, but they need careful handling —
// especially if any part of their input can come from a user.

import type { Confidence, Language, RuleMatch, SecurityRule, SourceFile } from "../../types/scanner";
import { isCommentLine, shorten, stripStringsKeepInterpolations } from "./text-utils";

interface DangerousCall {
  languages: readonly Language[];
  name: string;
  /** Matches the call; the argument text starts right after the match. */
  regex: RegExp;
  why: string;
  /** Only report if the file also contains this (e.g. an import). */
  requiresInFile?: RegExp;
}

const JS: readonly Language[] = ["JavaScript", "TypeScript", "HTML"];

const CALLS: DangerousCall[] = [
  {
    languages: ["Java"],
    name: "Runtime.exec",
    regex: /Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(/,
    why: "runs an operating-system command",
  },
  {
    languages: ["Java"],
    name: "ProcessBuilder",
    regex: /new\s+ProcessBuilder\s*\(/,
    why: "starts an operating-system process",
  },
  {
    languages: ["Python"],
    name: "eval",
    regex: /(?<![.\w])eval\s*\(/,
    why: "evaluates a string as Python code",
  },
  {
    languages: ["Python"],
    name: "exec",
    regex: /(?<![.\w])exec\s*\(/,
    why: "executes a string as Python code",
  },
  {
    languages: ["Python"],
    name: "os.system",
    regex: /\bos\s*\.\s*system\s*\(/,
    why: "runs a shell command",
  },
  {
    languages: ["Python"],
    name: "os.popen",
    regex: /\bos\s*\.\s*popen\s*\(/,
    why: "runs a shell command",
  },
  {
    languages: ["Python"],
    name: "subprocess with shell=True",
    regex: /\bsubprocess\s*\.\s*(?:run|call|Popen|check_output|check_call)\s*\((?=.*shell\s*=\s*True)/,
    why: "runs a command through the system shell",
  },
  {
    languages: JS,
    name: "eval",
    regex: /(?<![.\w$])eval\s*\(/,
    why: "evaluates a string as JavaScript code",
  },
  {
    languages: JS,
    name: "new Function",
    regex: /\bnew\s+Function\s*\(/,
    why: "creates a function from a string of code",
  },
  {
    languages: ["JavaScript", "TypeScript"],
    name: "child_process exec",
    regex: /(?<![\w$.])(?:child_process\s*\.\s*|cp\s*\.\s*|\)\s*\.\s*)?(?:exec|execSync)\s*\(/,
    why: "runs a shell command",
    requiresInFile: /child_process/,
  },
];

/** A call whose argument is a single plain string literal is lower risk. */
function isLiteralOnly(argText: string): boolean {
  const t = argText.trim();
  return /^(["'])(?:\\.|(?!\1).)*\1\s*[),]/.test(t) || /^`[^`$]*`\s*[),]/.test(t);
}

export const dangerousFunctionRule: SecurityRule = {
  id: "DANGER-001",
  title: "Potentially Dangerous Function Usage",
  description:
    "The code uses a function that runs code or system commands dynamically. This requires careful handling: if user-controlled input reaches it, an attacker might be able to run their own code or commands.",
  severity: "MEDIUM",
  recommendation:
    "Avoid dynamic code execution where possible. Prefer safer alternatives (e.g. JSON.parse or ast.literal_eval instead of eval, argument arrays instead of shell strings), never pass user input directly, and validate input against an allow-list.",
  languages: ["Java", "Python", "JavaScript", "TypeScript", "HTML"],

  check(file: SourceFile, lines: string[]): RuleMatch[] {
    const matches: RuleMatch[] = [];
    const whole = file.content;

    lines.forEach((line, idx) => {
      if (isCommentLine(line, file.language)) return;
      // Search in a copy where string contents are blanked, so text like
      // "please don't eval(this)" inside a string doesn't count.
      const codeOnly = stripStringsKeepInterpolations(line);

      for (const call of CALLS) {
        if (!call.languages.includes(file.language)) continue;
        if (call.requiresInFile && !call.requiresInFile.test(whole)) continue;
        const m = call.regex.exec(codeOnly);
        if (!m) continue;

        const argText = line.slice(m.index + m[0].length);
        const literal = isLiteralOnly(argText);
        const confidence: Confidence = literal ? "LOW" : "HIGH";
        matches.push({
          lineNumber: idx + 1,
          confidence,
          evidence: literal
            ? `The code calls ${call.name}, which ${call.why}. The argument appears to be a fixed string, so the risk is lower, but the call still deserves review: ${shorten(line, 100)}`
            : `The code calls ${call.name}, which ${call.why}, with an argument that is not a fixed string (it may contain variables): ${shorten(line, 100)}`,
        });
        return; // one finding per line
      }
    });
    return matches;
  },
};
