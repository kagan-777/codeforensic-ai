// POST /api/projects/[id]/rescan — upload a new version of an existing project.
// Creates a NEW scan record; previous scans are kept for comparison.
import { handleZipUpload } from "@/lib/scan/upload-handler";
import { isUuid, jsonError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Invalid project id.");
  return handleZipUpload(request, id);
}
