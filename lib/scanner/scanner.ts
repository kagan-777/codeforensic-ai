// The static analysis engine.
// ZIP bytes  ->  safe in-memory extraction  ->  file detection  ->  rules  ->  findings with evidence
// Nothing from the upload is ever executed.

import { createHash } from "node:crypto";
import type { Finding, Language, ScanOutput, ScanStage, SkippedFile, SourceFile } from "../../types/scanner";
import { extractSelected, readZipDirectory, ZipError } from "../zip/safe-zip";
import { detectLanguage, looksBinary, MAX_FILES_TO_ANALYZE, skipReason } from "./file-detector";
import { commonRootFolder, projectNameFrom, stripRoot, summarizeLanguages } from "./project-analyzer";
import { SECURITY_RULES } from "./security-rules";
import { redactSecrets } from "../utils/redact";

export const MAX_FINDINGS_PER_FILE = 50;
export const MAX_FINDINGS_TOTAL = 500;
const MAX_LINE_LENGTH = 4000; // very long lines (minified code) are cut to keep regexes fast
const SNIPPET_CONTEXT = 3; // lines shown before/after the finding

const CONFIG_STYLE: readonly Language[] = ["Properties", "ENV", "YAML", "Config"];
const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export function splitLines(content: string): string[] {
  return content
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .map((l) => (l.length > MAX_LINE_LENGTH ? l.slice(0, MAX_LINE_LENGTH) : l));
}

export function buildSnippet(
  lines: string[],
  lineNumber: number,
  language: Language,
): { snippet: string; startLine: number } {
  const start = Math.max(1, lineNumber - SNIPPET_CONTEXT);
  const end = Math.min(lines.length, lineNumber + SNIPPET_CONTEXT);
  const raw = lines.slice(start - 1, end).map((l) => (l.length > 300 ? l.slice(0, 300) + " …" : l));
  return { snippet: redactSecrets(raw.join("\n"), { config: CONFIG_STYLE.includes(language) }), startLine: start };
}

function normalizeForFingerprint(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function fingerprint(ruleId: string, filePath: string, lineText: string, occurrence: number): string {
  return createHash("sha256")
    .update(`${ruleId}|${filePath}|${normalizeForFingerprint(lineText)}|${occurrence}`)
    .digest("hex")
    .slice(0, 32);
}

/** Runs every applicable rule on every file. Pure function — easy to test. */
export function scanFiles(files: SourceFile[]): { findings: Finding[]; truncated: boolean } {
  const findings: Finding[] = [];
  let truncated = false;

  for (const file of files) {
    const lines = splitLines(file.content);
    const seen = new Set<string>();
    const occurrences = new Map<string, number>();
    let perFile = 0;

    for (const rule of SECURITY_RULES) {
      if (!rule.languages.includes(file.language)) continue;
      let matches;
      try {
        matches = rule.check(file, lines);
      } catch (err) {
        // A bug in one rule must not break the whole scan.
        console.error(`[scanner] rule ${rule.id} failed on ${file.path}:`, err);
        continue;
      }

      for (const m of matches) {
        const ruleId = m.ruleId ?? rule.id;
        const key = `${ruleId}:${m.lineNumber}`;
        if (seen.has(key)) continue;
        // Never create a finding without real evidence.
        if (!m.evidence || m.lineNumber < 1 || m.lineNumber > lines.length) continue;
        seen.add(key);

        if (perFile >= MAX_FINDINGS_PER_FILE || findings.length >= MAX_FINDINGS_TOTAL) {
          truncated = true;
          break;
        }
        perFile++;

        const lineText = lines[m.lineNumber - 1];
        const occKey = `${ruleId}|${normalizeForFingerprint(lineText)}`;
        const occurrence = occurrences.get(occKey) ?? 0;
        occurrences.set(occKey, occurrence + 1);

        const { snippet, startLine } = buildSnippet(lines, m.lineNumber, file.language);
        findings.push({
          ruleId,
          title: m.title ?? rule.title,
          description: m.description ?? rule.description,
          filePath: file.path,
          lineNumber: m.lineNumber,
          severity: m.severity ?? rule.severity,
          confidence: m.confidence,
          evidence: m.evidence,
          codeSnippet: snippet,
          snippetStartLine: startLine,
          recommendation: m.recommendation ?? rule.recommendation,
          language: file.language,
          fingerprint: fingerprint(ruleId, file.path, lineText, occurrence),
        });
      }
    }
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.filePath.localeCompare(b.filePath) ||
      a.lineNumber - b.lineNumber,
  );
  return { findings, truncated };
}

/**
 * Full pipeline from ZIP bytes to scan output.
 * Throws ZipError (with a friendly userMessage) for invalid uploads.
 */
export function scanZip(zip: Buffer, zipFilename: string, onStage?: (stage: ScanStage) => void): ScanOutput {
  onStage?.("validating");
  const dir = readZipDirectory(zip);

  const root = commonRootFolder(dir.entries.map((e) => e.path));
  const projectName = projectNameFrom(zipFilename, root);

  onStage?.("extracting");
  let selected = 0;
  const extracted = extractSelected(zip, dir, (entry) => {
    const reason = skipReason(entry.path, entry.uncompressedSize);
    if (reason) return reason;
    if (selected >= MAX_FILES_TO_ANALYZE) return "File limit reached (2,000 files)";
    selected++;
    return null;
  });

  onStage?.("detecting");
  const skipped: SkippedFile[] = extracted.skipped
    .filter((s) => s.reason !== "Dependency/build folder ignored")
    .map((s) => ({ path: stripRoot(s.path, root), reason: s.reason }));
  const files: SourceFile[] = [];
  for (const f of extracted.files) {
    const path = stripRoot(f.path, root);
    if (looksBinary(f.data)) {
      skipped.push({ path, reason: "Binary content ignored" });
      continue;
    }
    const language = detectLanguage(f.path);
    if (!language) continue;
    files.push({ path, language, content: f.data.toString("utf8") });
  }

  if (files.length === 0 && dir.entries.every((e) => e.isDirectory)) {
    throw new ZipError("EMPTY_ZIP");
  }

  onStage?.("analyzing");
  const { findings, truncated } = scanFiles(files);
  const summary = summarizeLanguages(files.map((f) => f.language));

  return {
    projectName,
    filesScanned: files.length,
    languages: summary.languages,
    sourceFileCount: summary.sourceFileCount,
    configFileCount: summary.configFileCount,
    skipped: skipped.slice(0, 200),
    findings,
    counts: {
      high: findings.filter((f) => f.severity === "HIGH").length,
      medium: findings.filter((f) => f.severity === "MEDIUM").length,
      low: findings.filter((f) => f.severity === "LOW").length,
    },
    truncated,
  };
}
