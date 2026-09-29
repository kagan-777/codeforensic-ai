// ScanStore implementation backed by Supabase.
// All queries use the logged-in user's client, so Row Level Security enforces
// that users can only touch their own projects, scans and findings.
import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { ScanStore } from "@/lib/scan/pipeline";

class DbError extends Error {}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) {
    console.error(`[db] ${what} failed:`, result.error.message);
    throw new DbError(`${what} failed`);
  }
  if (result.data === null) throw new DbError(`${what} returned no data`);
  return result.data;
}

export function createSupabaseScanStore(supabase: ServerSupabase, userId: string): ScanStore {
  return {
    async createProject({ name, originalFilename }) {
      const row = check(
        await supabase
          .from("projects")
          .insert({ user_id: userId, name, original_filename: originalFilename })
          .select("id")
          .single(),
        "create project",
      ) as unknown as { id: string };
      return row.id;
    },

    async projectExists(projectId) {
      const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
      if (error) {
        console.error("[db] project lookup failed:", error.message);
        throw new DbError("project lookup failed");
      }
      return data !== null; // RLS hides other users' projects → null
    },

    async latestCompletedScanId(projectId) {
      const { data, error } = await supabase
        .from("scans")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "COMPLETED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new DbError("previous scan lookup failed");
      return (data as unknown as { id: string } | null)?.id ?? null;
    },

    async createScan({ projectId, originalFilename, previousScanId }) {
      const row = check(
        await supabase
          .from("scans")
          .insert({
            project_id: projectId,
            user_id: userId,
            status: "QUEUED",
            stage: "validating",
            original_filename: originalFilename,
            previous_scan_id: previousScanId,
          })
          .select("id")
          .single(),
        "create scan",
      ) as unknown as { id: string };
      return row.id;
    },

    async updateScan(scanId, patch) {
      const { error } = await supabase.from("scans").update(patch).eq("id", scanId);
      if (error) {
        console.error("[db] update scan failed:", error.message);
        throw new DbError("update scan failed");
      }
    },

    async insertFindings(scanId, projectId, findings) {
      const rows = findings.map((f) => ({
        scan_id: scanId,
        project_id: projectId,
        user_id: userId,
        rule_id: f.ruleId,
        title: f.title,
        description: f.description,
        file_path: f.filePath,
        line_number: f.lineNumber,
        severity: f.severity,
        confidence: f.confidence,
        evidence: f.evidence,
        code_snippet: f.codeSnippet,
        snippet_start_line: f.snippetStartLine,
        recommendation: f.recommendation,
        language: f.language,
        fingerprint: f.fingerprint,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("findings").insert(rows.slice(i, i + 100));
        if (error) {
          console.error("[db] insert findings failed:", error.message);
          throw new DbError("insert findings failed");
        }
      }
    },

    async updateProject(projectId, patch) {
      const { error } = await supabase
        .from("projects")
        .update({
          file_count: patch.fileCount,
          languages: patch.languages,
          original_filename: patch.originalFilename,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);
      if (error) {
        console.error("[db] update project failed:", error.message);
        throw new DbError("update project failed");
      }
    },
  };
}
