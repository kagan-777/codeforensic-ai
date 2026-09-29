// GET /api/scans/[id] — scan status, statistics, findings and comparison with the previous scan.
import { isUuid, jsonError, requireApiUser } from "@/lib/auth";
import { getScanDetails } from "@/lib/scan/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Invalid scan id.");
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const details = await getScanDetails(auth.supabase, id);
    if (!details) return jsonError(404, "Scan not found.");
    return Response.json(details, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/scans] failed:", err);
    return jsonError(500, "Could not load the scan. Please try again.");
  }
}
