// Supabase client for the BROWSER (login/signup forms).
// Uses only the public publishable key — safe to ship to the browser,
// because Row Level Security protects the data.
import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
