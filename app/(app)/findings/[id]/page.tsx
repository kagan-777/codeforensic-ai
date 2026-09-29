import { notFound } from "next/navigation";
import FindingDetails from "@/components/FindingDetails";
import { isUuid, requirePageUser } from "@/lib/auth";
import { getFinding, getProject } from "@/lib/scan/queries";

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requirePageUser();
  const finding = await getFinding(supabase, id); // RLS: other users' findings return null
  if (!finding) notFound();
  const project = await getProject(supabase, finding.project_id);

  return (
    <div className="mx-auto max-w-4xl">
      <FindingDetails finding={finding} projectName={project?.name} />
    </div>
  );
}
