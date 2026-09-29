// Row shapes of the Supabase tables (see supabase/schema.sql).

import type { Confidence, Language, ScanStage, ScanStatus, Severity } from "./scanner";

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  original_filename: string | null;
  file_count: number;
  languages: Language[];
  created_at: string;
  updated_at: string;
}

export interface ScanRow {
  id: string;
  project_id: string;
  user_id: string;
  previous_scan_id: string | null;
  status: ScanStatus;
  stage: ScanStage | null;
  original_filename: string | null;
  started_at: string | null;
  completed_at: string | null;
  files_scanned: number;
  findings_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  skipped_count: number;
  truncated: boolean;
  error_message: string | null;
  created_at: string;
}

/** Stored AI explanation (validated before saving). */
export interface StoredExplanation {
  summary: string;
  whyRisky: string;
  evidenceExplanation: string;
  recommendation: string;
  manualReview: boolean;
  /**
   * AI-suggested safer version of the code window (same lines as code_snippet).
   * "" = the AI could not suggest a safe fix; undefined = explanation made before this feature.
   */
  fixedCode?: string;
  /** True if the static analyzer still detects the same pattern in fixedCode. */
  fixStillFlagged?: boolean;
  /** Sensitive-looking variables the suggestion removed completely — the program may still need them. */
  fixRemovedNames?: string[];
}

export interface FindingRow {
  id: string;
  scan_id: string;
  project_id: string;
  user_id: string;
  rule_id: string;
  title: string;
  description: string;
  file_path: string;
  line_number: number;
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  code_snippet: string;
  snippet_start_line: number;
  recommendation: string;
  language: Language | null;
  fingerprint: string;
  ai_explanation: StoredExplanation | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  created_at: string;
}

/** Columns needed for finding cards (no big text columns). */
export const FINDING_CARD_COLUMNS =
  "id, scan_id, rule_id, title, file_path, line_number, severity, confidence, evidence, fingerprint" as const;

export type FindingCard = Pick<
  FindingRow,
  "id" | "scan_id" | "rule_id" | "title" | "file_path" | "line_number" | "severity" | "confidence" | "evidence" | "fingerprint"
>;
