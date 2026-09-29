import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardStats from "@/components/DashboardStats";
import RiskOverview, { riskIndex } from "@/components/RiskOverview";
import PageHero from "@/components/PageHero";
import ScannerOrb from "@/components/ScannerOrb";
import FindingCard from "@/components/FindingCard";
import FindingList from "@/components/FindingList";
import LoadingState from "@/components/LoadingState";
import ScanStatusPoller from "@/components/ScanStatusPoller";
import { StatusPill } from "@/components/ProjectList";
import { isUuid, requirePageUser } from "@/lib/auth";
import { getScanDetails } from "@/lib/scan/queries";
import { formatDateTime } from "@/lib/utils/format";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requirePageUser();
  const details = await getScanDetails(supabase, id);
  if (!details) notFound();
  const { scan, project, findings, previous, comparison } = details;
  const risk = riskIndex({ high: scan.high_count, medium: scan.medium_count, low: scan.low_count });

  return (
    <div className="space-y-8">
      {project && (
        <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-accent">
          ← {project.name}
        </Link>
      )}
      <PageHero
        eyebrow="SCAN RESULTS"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Scan results <StatusPill status={scan.status} />
          </span>
        }
        subtitle={
          <>
            {formatDateTime(scan.created_at)} · <span className="font-mono">{scan.original_filename}</span>
            {scan.skipped_count > 0 && ` · ${scan.skipped_count} file(s) skipped (unsupported, binary or too large)`}
            <span className="mt-1 block text-xs">Red nodes on the globe grow with this scan&apos;s risk index ({risk}).</span>
          </>
        }
        visual={<ScannerOrb nodes={180} hotRatio={scan.status === "COMPLETED" ? (risk / 100) * 0.3 : 0} />}
      />

      {(scan.status === "QUEUED" || scan.status === "SCANNING") && (
        <>
          <LoadingState label="This scan is still running…" />
          <ScanStatusPoller scanId={scan.id} />
        </>
      )}

      {scan.status === "FAILED" && (
        <div role="alert" className="rounded-xl border border-high/40 bg-high/10 p-5 text-sm">
          <p className="font-semibold text-high">The scan failed</p>
          <p className="mt-1 text-muted">{scan.error_message ?? "Something went wrong. Please try uploading again."}</p>
        </div>
      )}

      {scan.status === "COMPLETED" && (
        <>
          <DashboardStats
            filesScanned={scan.files_scanned}
            languages={project?.languages.length ?? 0}
            findings={scan.findings_count}
            high={scan.high_count}
            medium={scan.medium_count}
            low={scan.low_count}
          />
          <RiskOverview high={scan.high_count} medium={scan.medium_count} low={scan.low_count} title="Risk overview (this scan)" />
          {project && project.languages.length > 0 && (
            <p className="text-xs text-muted">Languages detected: {project.languages.join(", ")}</p>
          )}
          {scan.truncated && (
            <p className="rounded-lg border border-medium/40 bg-medium/10 px-4 py-3 text-sm text-medium">
              This project produced a very large number of findings; only the first 500 are shown.
            </p>
          )}

          {comparison && previous && (
            <section aria-labelledby="cmp" className="rounded-xl border border-line bg-surface p-5">
              <h2 id="cmp" className="font-semibold">
                Compared with the previous scan
              </h2>
              <p className="mt-1 text-xs text-muted">
                Previous scan: {formatDateTime(previous.created_at)} ·{" "}
                <Link href={`/scans/${previous.id}`} className="text-accent hover:underline">
                  view
                </Link>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Previous findings", previous.findings_count, "text-text"],
                  ["Current findings", scan.findings_count, "text-text"],
                  ["New findings", comparison.newFindings.length, "text-high"],
                  ["No longer detected", comparison.noLongerDetected.length, "text-accent"],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="rounded-lg bg-surface-2 p-3">
                    <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
                    <dd className={`font-mono text-xl font-semibold ${tone}`}>{value}</dd>
                  </div>
                ))}
              </dl>
              {comparison.noLongerDetected.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">No-longer-detected findings</h3>
                  <p className="mb-3 mt-1 text-xs text-muted">
                    These findings are no longer detected by the current analyzer. That is a good sign, but it does not
                    prove the project is secure.
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {comparison.noLongerDetected.map((f) => (
                      <FindingCard key={f.id} finding={f} tag="gone" />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="mb-3 font-semibold">{comparison ? "Current findings" : "Findings"}</h2>
            {findings.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
                No potential risk patterns were detected by the current analyzer. The MVP checks only 5 pattern types, so
                a manual review is still worthwhile — this does not mean the project is guaranteed to be secure.
              </p>
            ) : (
              <FindingList findings={findings} newIds={comparison?.newFindings.map((f) => f.id)} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
