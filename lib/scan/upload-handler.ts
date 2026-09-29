// Shared handler for "upload a ZIP and scan it" (new project OR rescan).
// Streams progress to the browser as newline-delimited JSON events:
//   {"type":"stage","stage":"extracting","message":"…"}
//   {"type":"complete","scanId":"…","projectId":"…",…}
import "server-only";
import { jsonError, requireApiUser } from "@/lib/auth";
import { createSupabaseScanStore } from "@/lib/supabase/scan-store";
import { NotFoundError, runScan, type ScanEvent } from "@/lib/scan/pipeline";
import { ZIP_LIMITS } from "@/lib/zip/safe-zip";
import { rateLimit } from "@/lib/utils/rate-limit";

export async function handleZipUpload(request: Request, projectId?: string): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  if (!rateLimit(`scan:${user.id}`, 10, 10 * 60 * 1000)) {
    return jsonError(429, "You have started many scans recently. Please wait a few minutes and try again.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Upload failed: expected a form with a ZIP file.");
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return jsonError(400, "Please choose a ZIP file to upload.");
  const filename = (file.name || "project.zip").slice(0, 200);
  if (!/\.zip$/i.test(filename)) return jsonError(400, "Only .zip files are supported.");
  if (file.size === 0) return jsonError(400, "The ZIP file is empty.");
  if (file.size > ZIP_LIMITS.maxZipBytes) return jsonError(413, "The ZIP file is too large. The limit is 100 MB.");

  const zip = Buffer.from(await file.arrayBuffer());
  const store = createSupabaseScanStore(supabase, user.id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ScanEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await runScan({ store, zip, zipFilename: filename, projectId, emit });
      } catch (err) {
        if (err instanceof NotFoundError) {
          emit({ type: "error", message: "Project not found." });
        } else {
          console.error("[upload] unexpected error:", err);
          emit({ type: "error", message: "Something went wrong while saving the scan. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
