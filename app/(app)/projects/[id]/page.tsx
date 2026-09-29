import Link from "next/link";
import { notFound } from "next/navigation";
import UploadProject from "@/components/UploadProject";
import PageHero from "@/components/PageHero";
import Scene3D from "@/components/Scene3D";
import { riskIndex } from "@/components/RiskOverview";
import { StatusPill } from "@/components/ProjectList";
import { isUuid, requirePageUser } from "@/lib/auth";
import { getProject, getScansForProjects } from "@/lib/scan/queries";
import { formatDateTime } from "@/lib/utils/format";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requirePageUser();
  const project = await getProject(supabase, id); // RLS: other users' projects return null
  if (!project) notFound();
  const scans = await getScansForProjects(supabase, [project.id]);
  const latestDone = scans.find((s) => s.status === "COMPLETED");
  const risk = latestDone ? riskIndex({ high: latestDone.high_count, medium: latestDone.medium_count, low: latestDone.low_count }) : 0;

  return (
    <div className="space-y-8">
      <Link href="/projects" className="text-sm text-muted hover:text-accent">
        ← Projects
      </Link>
      <PageHero
        eyebrow="PROJECT"
        title={project.name}
        subtitle={
          <>
            {project.file_count} files analyzed · {project.languages.join(", ") || "no languages detected"} · last upload{" "}
            <span className="font-mono">{project.original_filename}</span>
            <span className="mt-1 block text-xs">Each orbit is one scan ({scans.length}); the core&apos;s colour shows the latest risk index ({risk}).</span>
          </>
        }
        visual={<Scene3D scene="rings" data={{ scans: scans.length, risk }} />}
      />

      <section>
        <h2 className="mb-3 font-semibold">Scan history</h2>
        {scans.length === 0 ? (
          <p className="text-sm text-muted">No scans yet.</p>
        ) : (
          <div className="glass overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Scan</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Files</th>
                  <th className="px-4 py-2 font-medium">Findings</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {scans.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p>{formatDateTime(s.created_at)}</p>
                      <p className="font-mono text-xs text-muted">
                        {s.original_filename}
                        {i === 0 && " · latest"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} />
                      {s.status === "FAILED" && s.error_message && <p className="mt-1 max-w-xs text-xs text-high">{s.error_message}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono">{s.files_scanned}</td>
                    <td className="px-4 py-3 font-mono">
                      {s.findings_count} <span className="text-high">{s.high_count}H</span>{" "}
                      <span className="text-medium">{s.medium_count}M</span> <span className="text-low">{s.low_count}L</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/scans/${s.id}`} className="text-xs font-semibold text-accent hover:underline">
                        View scan
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="max-w-2xl">
        <h2 className="font-semibold">Rescan with a new version</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Made changes? Upload the updated ZIP. A new scan is created (older scans are kept) and compared with the
          previous one.
        </p>
        <UploadProject projectId={project.id} />
      </section>
    </div>
  );
}
