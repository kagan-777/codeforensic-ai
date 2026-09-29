// POST /api/scans — start a scan from a ZIP.
// Form fields: file (required), projectId (optional: rescan that project).
// Same behaviour as /api/projects/upload and /api/projects/[id]/rescan.
import { handleZipUpload } from "@/lib/scan/upload-handler";
import { isUuid, jsonError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  if (projectId !== undefined && !isUuid(projectId)) return jsonError(400, "Invalid project id.");
  return handleZipUpload(request, projectId);
}
