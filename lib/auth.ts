// Helpers to get the logged-in user on the server.
// We NEVER trust a user id sent by the browser — identity always comes from Supabase Auth.
import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";

/** For pages: returns the user or redirects to /login. */
export async function requirePageUser(): Promise<{ supabase: ServerSupabase; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** For API routes: returns the user, or a 401 JSON response to send back. */
export async function requireApiUser(): Promise<
  { ok: true; supabase: ServerSupabase; user: User } | { ok: false; response: Response }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, response: jsonError(401, "Please log in to continue.") };
    return { ok: true, supabase, user };
  } catch (err) {
    console.error("[auth] could not create Supabase client:", err);
    return { ok: false, response: jsonError(500, "The server is not configured correctly.") };
  }
}

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
