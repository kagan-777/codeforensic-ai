import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import PageHero from "@/components/PageHero";
import Scene3D from "@/components/Scene3D";
import ProjectList, { newestScanByProject } from "@/components/ProjectList";
import { requirePageUser } from "@/lib/auth";
import { getProjects, getScansForProjects } from "@/lib/scan/queries";

export const metadata = { title: "Projects · CODEFORENSIC AI" };

export default async function ProjectsPage() {
  const { supabase } = await requirePageUser();
  const projects = await getProjects(supabase);
  const scans = await getScansForProjects(supabase, projects.map((p) => p.id));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="YOUR WORKSPACE"
        title="Projects"
        subtitle={`${projects.length} project(s). Each cube is one of your projects.`}
        visual={<Scene3D scene="cubes" data={{ count: projects.length }} />}
        actions={
          <Link href="/projects/new" className="btn-glow rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg hover:bg-accent-strong">
            Upload Project →
          </Link>
        }
      />
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" message="Upload a ZIP to create your first project." actionHref="/projects/new" actionLabel="Upload Project" />
      ) : (
        <ProjectList projects={projects} lastScans={newestScanByProject(scans)} />
      )}
    </div>
  );
}
