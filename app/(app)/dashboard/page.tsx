import Link from "next/link";
import DashboardStats from "@/components/DashboardStats";
import RiskOverview from "@/components/RiskOverview";
import PageHero from "@/components/PageHero";
import Scene3D from "@/components/Scene3D";
import EmptyState from "@/components/EmptyState";
import FindingCard from "@/components/FindingCard";
import ProjectList, { newestCompletedByProject, newestScanByProject } from "@/components/ProjectList";
import { requirePageUser } from "@/lib/auth";
import { getProjects, getScansForProjects } from "@/lib/scan/queries";
import { FINDING_CARD_COLUMNS, type FindingCard as FindingCardData } from "@/types/database";

export const metadata = { title: "Dashboard · CODEFORENSIC AI" };

export default async function DashboardPage() {
  const { supabase } = await requirePageUser();
  const projects = await getProjects(supabase);
  const scans = await getScansForProjects(supabase, projects.map((p) => p.id));
  const latest = newestScanByProject(scans);
  const latestCompleted = newestCompletedByProject(scans);
  const completed = Array.from(latestCompleted.values());

  // Statistics = sum of each project's most recent completed scan (all real data).
  const stats = completed.reduce(
    (acc, s) => ({
      filesScanned: acc.filesScanned + s.files_scanned,
      findings: acc.findings + s.findings_count,
      high: acc.high + s.high_count,
      medium: acc.medium + s.medium_count,
      low: acc.low + s.low_count,
    }),
    { filesScanned: 0, findings: 0, high: 0, medium: 0, low: 0 },
  );
  const languages = new Set(projects.filter((p) => latestCompleted.has(p.id)).flatMap((p) => p.languages));

  let topFindings: FindingCardData[] = [];
  if (completed.length > 0) {
    const { data } = await supabase
      .from("findings")
      .select(FINDING_CARD_COLUMNS)
      .in("scan_id", completed.map((s) => s.id))
      .limit(300);
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    topFindings = ((data ?? []) as unknown as FindingCardData[])
      .sort((a, b) => order[a.severity] - order[b.severity] || a.file_path.localeCompare(b.file_path))
      .slice(0, 6);
  }

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="SECURITY OVERVIEW"
        title="Dashboard"
        subtitle="Totals from the latest completed scan of each project. The 3D bars show your real HIGH, MEDIUM and LOW counts."
        visual={<Scene3D scene="towers" data={{ high: stats.high, medium: stats.medium, low: stats.low }} />}
        actions={
          <Link href="/projects/new" className="btn-glow rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg hover:bg-accent-strong">
            Upload Project →
          </Link>
        }
      />

      <DashboardStats {...stats} languages={languages.size} />
      {completed.length > 0 && <RiskOverview high={stats.high} medium={stats.medium} low={stats.low} title="Risk overview (latest scans)" />}

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          message="Upload a ZIP of your project to run your first scan. Tip: try the demo ZIP in the demo-project folder."
          actionHref="/projects/new"
          actionLabel="Upload Project"
        />
      ) : (
        <>
          <section>
            <h2 className="mb-3 font-semibold">Recent projects</h2>
            <ProjectList projects={projects.slice(0, 5)} lastScans={latest} />
          </section>
          <section>
            <h2 className="mb-3 font-semibold">Top findings</h2>
            {topFindings.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
                No potential risk patterns were detected by the current analyzer in your latest scans. This does not mean
                the code is guaranteed to be secure.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {topFindings.map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
