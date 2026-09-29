// Read helpers used by pages and API routes. Every query runs as the logged-in
// user, so RLS guarantees they only return that user's data.
import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { compareScans, type ScanComparison } from "@/lib/scanner/compare";
import { FINDING_CARD_COLUMNS, type FindingCard, type FindingRow, type ProjectRow, type ScanRow } from "@/types/database";

export async function getProjects(supabase: ServerSupabase): Promise<ProjectRow[]> {
  const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(`projects query failed: ${error.message}`);
  return (data ?? []) as ProjectRow[];
}

export async function getProject(supabase: ServerSupabase, id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`project query failed: ${error.message}`);
  return data as ProjectRow | null;
}

export async function getScansForProjects(supabase: ServerSupabase, projectIds: string[]): Promise<ScanRow[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("scans")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`scans query failed: ${error.message}`);
  return (data ?? []) as ScanRow[];
}

export async function getScan(supabase: ServerSupabase, id: string): Promise<ScanRow | null> {
  const { data, error } = await supabase.from("scans").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`scan query failed: ${error.message}`);
  return data as ScanRow | null;
}

export async function getFindingCards(supabase: ServerSupabase, scanId: string): Promise<FindingCard[]> {
  const { data, error } = await supabase
    .from("findings")
    .select(FINDING_CARD_COLUMNS)
    .eq("scan_id", scanId)
    .order("line_number", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`findings query failed: ${error.message}`);
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return ((data ?? []) as unknown as FindingCard[]).sort(
    (a, b) => order[a.severity] - order[b.severity] || a.file_path.localeCompare(b.file_path) || a.line_number - b.line_number,
  );
}

export async function getFinding(supabase: ServerSupabase, id: string): Promise<FindingRow | null> {
  const { data, error } = await supabase.from("findings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`finding query failed: ${error.message}`);
  return data as FindingRow | null;
}

export interface ScanDetails {
  scan: ScanRow;
  project: ProjectRow | null;
  findings: FindingCard[];
  previous: ScanRow | null;
  comparison: ScanComparison<FindingCard> | null;
}

/** A scan, its findings, and (if it is a rescan) the comparison with the previous scan. */
export async function getScanDetails(supabase: ServerSupabase, scanId: string): Promise<ScanDetails | null> {
  const scan = await getScan(supabase, scanId);
  if (!scan) return null;
  const [project, findings] = await Promise.all([getProject(supabase, scan.project_id), getFindingCards(supabase, scan.id)]);

  let previous: ScanRow | null = null;
  let comparison: ScanComparison<FindingCard> | null = null;
  if (scan.previous_scan_id && scan.status === "COMPLETED") {
    previous = await getScan(supabase, scan.previous_scan_id);
    if (previous) {
      const previousFindings = await getFindingCards(supabase, previous.id);
      comparison = compareScans(previousFindings, findings);
    }
  }
  return { scan, project, findings, previous, comparison };
}
