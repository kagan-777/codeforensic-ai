import Link from "next/link";
import type { ProjectRow, ScanRow } from "@/types/database";
import { formatDateTime } from "@/lib/utils/format";

export function StatusPill({ status }: { status: ScanRow["status"] }) {
  const styles: Record<ScanRow["status"], string> = {
    QUEUED: "bg-surface-2 text-muted",
    SCANNING: "bg-low/15 text-low",
    COMPLETED: "bg-accent/15 text-accent",
    FAILED: "bg-high/15 text-high",
  };
  return <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${styles[status]}`}>{status}</span>;
}

/** Project list used on the dashboard and the projects page. `lastScans` maps project id → newest scan. */
export default function ProjectList({ projects, lastScans }: { projects: ProjectRow[]; lastScans: Map<string, ScanRow> }) {
  return (
    <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
      {projects.map((p) => {
        const scan = lastScans.get(p.id);
        return (
          <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{p.languages.length ? p.languages.join(" · ") : "No languages detected yet"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Last scan</p>
                <p className="text-xs">{formatDateTime(scan?.created_at)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Findings</p>
                <p className="font-mono text-xs">
                  {scan?.status === "COMPLETED" ? (
                    <>
                      {scan.findings_count} <span className="text-high">{scan.high_count}H</span>{" "}
                      <span className="text-medium">{scan.medium_count}M</span> <span className="text-low">{scan.low_count}L</span>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Status</p>
                {scan ? <StatusPill status={scan.status} /> : <span className="text-xs text-muted">No scans</span>}
              </div>
              <Link
                href={`/projects/${p.id}`}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
              >
                Open Project<span className="sr-only">: {p.name}</span>
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Newest scan per project (scans must be sorted newest first). */
export function newestScanByProject(scans: ScanRow[]): Map<string, ScanRow> {
  const map = new Map<string, ScanRow>();
  for (const s of scans) if (!map.has(s.project_id)) map.set(s.project_id, s);
  return map;
}

/** Newest COMPLETED scan per project. */
export function newestCompletedByProject(scans: ScanRow[]): Map<string, ScanRow> {
  return newestScanByProject(scans.filter((s) => s.status === "COMPLETED"));
}
