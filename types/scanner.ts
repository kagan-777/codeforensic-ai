// Shared types for the static analysis engine.
// The scanner is the SOURCE OF TRUTH for file, line, rule, severity,
// confidence and evidence. The AI only explains these facts.

export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type Language =
  | "Java"
  | "JavaScript"
  | "TypeScript"
  | "Python"
  | "SQL"
  | "HTML"
  | "JSON"
  | "YAML"
  | "Properties"
  | "ENV"
  | "Config";

export interface SourceFile {
  /** Path inside the project, always using "/" separators. */
  path: string;
  language: Language;
  content: string;
}

/** What a single rule reports for one line. */
export interface RuleMatch {
  lineNumber: number; // 1-based
  confidence: Confidence;
  evidence: string;
  /** Optional overrides for rules that have sub-checks (e.g. config rule). */
  ruleId?: string;
  title?: string;
  severity?: Severity;
  description?: string;
  recommendation?: string;
}

export interface SecurityRule {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  recommendation: string;
  languages: readonly Language[];
  check(file: SourceFile, lines: string[]): RuleMatch[];
}

export interface Finding {
  ruleId: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number;
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  /** A few lines around the match, with obvious secrets redacted. */
  codeSnippet: string;
  /** Line number of the first line in codeSnippet. */
  snippetStartLine: number;
  recommendation: string;
  language: Language;
  /** Stable id used to compare scans (rule + file + normalized line). */
  fingerprint: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface SeverityCounts {
  high: number;
  medium: number;
  low: number;
}

export interface ScanOutput {
  projectName: string;
  filesScanned: number;
  languages: Language[];
  sourceFileCount: number;
  configFileCount: number;
  skipped: SkippedFile[];
  findings: Finding[];
  counts: SeverityCounts;
  truncated: boolean;
}

export type ScanStatus = "QUEUED" | "SCANNING" | "COMPLETED" | "FAILED";

export type ScanStage =
  | "validating"
  | "extracting"
  | "detecting"
  | "analyzing"
  | "saving"
  | "completed"
  | "failed";
