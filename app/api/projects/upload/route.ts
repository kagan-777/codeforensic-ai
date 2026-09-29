// POST /api/projects/upload — upload a ZIP to create a new project and run its first scan.
import { handleZipUpload } from "@/lib/scan/upload-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleZipUpload(request);
}
