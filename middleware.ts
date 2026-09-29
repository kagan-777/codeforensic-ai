import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Runs on pages AND small API calls (like /api/findings/.../explain), so the
  // login session is always refreshed before the server checks who you are.
  // Skipped for the ZIP upload routes (/api/projects/..., /api/scans) so large
  // uploads are not buffered by middleware — those routes check login themselves.
  matcher: ["/((?!api/projects|api/scans|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
