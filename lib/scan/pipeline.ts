// Orchestrates one scan: validate ZIP -> create DB records -> analyze -> store results.
// The database is reached through the small ScanStore interface, so this file
// can be tested without Supabase (see tests/pipeline.test.ts).

import type { Finding, Language, ScanStage, ScanStatus } from "../../types/scanner";
import { readZipDirectory, ZipError } from "../zip/safe-zip";
import { commonRootFolder, projectNameFrom } from "../scanner/project-analyzer";
import { scanZip } from "../scanner/scanner";

export interface ScanPatch {
  status?: ScanStatus;
  stage?: ScanStage;
  started_at?: string;
  completed_at?: string;
  files_scanned?: number;
  findings_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
  skipped_count?: number;
  error_message?: string | null;
  truncated?: boolean;
}

/** Everything the pipeline needs from the database. Implementations are bound to ONE user. */
export interface ScanStore {
  createProject(input: { name: string; originalFilename: string }): Promise<string>;
  projectExists(projectId: string): Promise<boolean>;
  latestCompletedScanId(projectId: string): Promise<string | null>;
  createScan(input: { projectId: string; originalFilename: string; previousScanId: string | null }): Promise<string>;
  updateScan(scanId: string, patch: ScanPatch): Promise<void>;
  insertFindings(scanId: string, projectId: string, findings: Finding[]): Promise<void>;
  updateProject(projectId: string, patch: { fileCount: number; languages: Language[]; originalFilename: string }): Promise<void>;
}

export type ScanEvent =
  | { type: "stage"; stage: ScanStage; message: string }
  | { type: "complete"; scanId: string; projectId: string; findings: number; filesScanned: number }
  | { type: "error"; message: string; scanId?: string; projectId?: string };

export const STAGE_MESSAGES: Record<ScanStage, string> = {
  validating: "Validating ZIP…",
  extracting: "Extracting files safely (in memory, nothing is executed)…",
  detecting: "Detecting languages and source files…",
  analyzing: "Analyzing security patterns…",
  saving: "Saving findings…",
  completed: "Completed",
  failed: "Failed",
};

export class NotFoundError extends Error {}

export interface RunScanInput {
  store: ScanStore;
  zip: Buffer;
  zipFilename: string;
  /** Set for a rescan of an existing project. */
  projectId?: string;
  emit: (event: ScanEvent) => void;
}

export async function runScan({ store, zip, zipFilename, projectId, emit }: RunScanInput): Promise<ScanEvent> {
  const stage = (s: ScanStage) => emit({ type: "stage", stage: s, message: STAGE_MESSAGES[s] });

  // 1. Validate the ZIP structure BEFORE creating any database records,
  //    so a bad upload doesn't leave an empty project behind.
  stage("validating");
  let dirPaths: string[];
  try {
    dirPaths = readZipDirectory(zip).entries.map((e) => e.path);
  } catch (err) {
    const event: ScanEvent = { type: "error", message: err instanceof ZipError ? err.userMessage : "The ZIP file could not be read." };
    if (!(err instanceof ZipError)) console.error("[scan] zip read failed:", err);
    emit(event);
    return event;
  }

  // 2. Project record (new upload) or ownership check (rescan).
  let pid: string;
  if (projectId) {
    if (!(await store.projectExists(projectId))) throw new NotFoundError("Project not found");
    pid = projectId;
  } else {
    pid = await store.createProject({
      name: projectNameFrom(zipFilename, commonRootFolder(dirPaths)),
      originalFilename: zipFilename,
    });
  }

  // 3. New scan record. Previous scans are never overwritten.
  const previousScanId = await store.latestCompletedScanId(pid);
  const scanId = await store.createScan({ projectId: pid, originalFilename: zipFilename, previousScanId });
  await store.updateScan(scanId, { status: "SCANNING", stage: "extracting", started_at: new Date().toISOString() });

  try {
    // 4. Static analysis (pure, in memory).
    const output = scanZip(zip, zipFilename, (s) => {
      if (s !== "validating") stage(s);
    });

    // 5. Store results.
    stage("saving");
    await store.insertFindings(scanId, pid, output.findings);
    await store.updateScan(scanId, {
      status: "COMPLETED",
      stage: "completed",
      completed_at: new Date().toISOString(),
      files_scanned: output.filesScanned,
      findings_count: output.findings.length,
      high_count: output.counts.high,
      medium_count: output.counts.medium,
      low_count: output.counts.low,
      skipped_count: output.skipped.length,
      truncated: output.truncated,
    });
    await store.updateProject(pid, {
      fileCount: output.filesScanned,
      languages: output.languages,
      originalFilename: zipFilename,
    });

    stage("completed");
    const event: ScanEvent = {
      type: "complete",
      scanId,
      projectId: pid,
      findings: output.findings.length,
      filesScanned: output.filesScanned,
    };
    emit(event);
    return event;
  } catch (err) {
    const message =
      err instanceof ZipError ? err.userMessage : "Something went wrong while scanning. Please try again.";
    if (!(err instanceof ZipError)) console.error(`[scan] scan ${scanId} failed:`, err);
    await store
      .updateScan(scanId, { status: "FAILED", stage: "failed", completed_at: new Date().toISOString(), error_message: message })
      .catch((e) => console.error("[scan] could not mark scan as failed:", e));
    const event: ScanEvent = { type: "error", message, scanId, projectId: pid };
    emit(event);
    return event;
  }
}
