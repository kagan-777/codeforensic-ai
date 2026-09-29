// Checks that Row Level Security really isolates users, against YOUR Supabase project.
//
// 1. Create two test accounts in the app (or Supabase → Authentication → Add user).
// 2. Add to .env.local:
//      TEST_USER_A_EMAIL=...   TEST_USER_A_PASSWORD=...
//      TEST_USER_B_EMAIL=...   TEST_USER_B_PASSWORD=...
// 3. Run:  npm run test:isolation
//
// It creates a temporary project/scan/finding as user A, checks that user B can't
// read, change or attach anything to it, then deletes it again.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in .env.local (see the comment at the top of this script).`);
    process.exit(1);
  }
  return v;
}

async function signIn(email: string, password: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Login failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

async function main() {
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  const a = await signIn(need("TEST_USER_A_EMAIL"), need("TEST_USER_A_PASSWORD"));
  const b = await signIn(need("TEST_USER_B_EMAIL"), need("TEST_USER_B_PASSWORD"));
  check("the two test users are different accounts", a.userId !== b.userId);

  // --- user A creates data
  const { data: project, error: pErr } = await a.client
    .from("projects").insert({ user_id: a.userId, name: "RLS isolation test" }).select("id").single();
  if (pErr || !project) throw new Error(`A could not create a project: ${pErr?.message}`);
  const { data: scan, error: sErr } = await a.client
    .from("scans").insert({ user_id: a.userId, project_id: project.id, status: "COMPLETED" }).select("id").single();
  if (sErr || !scan) throw new Error(`A could not create a scan: ${sErr?.message}`);
  const { data: finding, error: fErr } = await a.client.from("findings").insert({
    user_id: a.userId, scan_id: scan.id, project_id: project.id, rule_id: "TEST", title: "t", description: "d",
    file_path: "a.js", line_number: 1, severity: "LOW", confidence: "LOW", evidence: "e", code_snippet: "x",
    recommendation: "r", fingerprint: "f",
  }).select("id").single();
  if (fErr || !finding) throw new Error(`A could not create a finding: ${fErr?.message}`);
  check("user A can read their own project", !!(await a.client.from("projects").select("id").eq("id", project.id).maybeSingle()).data);

  try {
    // --- user B tries to access it
    const bp = await b.client.from("projects").select("*").eq("id", project.id);
    check("user B cannot read A's project", (bp.data ?? []).length === 0);
    const bs = await b.client.from("scans").select("*").eq("id", scan.id);
    check("user B cannot read A's scan", (bs.data ?? []).length === 0);
    const bf = await b.client.from("findings").select("*").eq("id", finding.id);
    check("user B cannot read A's finding", (bf.data ?? []).length === 0);

    const bu = await b.client.from("projects").update({ name: "hacked" }).eq("id", project.id).select("id");
    check("user B cannot rename A's project", (bu.data ?? []).length === 0);

    const bi = await b.client.from("scans").insert({ user_id: b.userId, project_id: project.id }).select("id");
    check("user B cannot attach a scan to A's project", !!bi.error);

    const spoof = await b.client.from("projects").insert({ user_id: a.userId, name: "spoofed" }).select("id");
    check("user B cannot create a project owned by A", !!spoof.error);

    const evid = await a.client.from("findings").update({ severity: "HIGH" }).eq("id", finding.id).select("id");
    check("even the owner cannot edit scanner evidence (severity)", !!evid.error);

    const anon = createClient(url, key, { auth: { persistSession: false } });
    const an = await anon.from("projects").select("id").eq("id", project.id);
    check("logged-out visitors cannot read projects", (an.data ?? []).length === 0);
  } finally {
    await a.client.from("projects").delete().eq("id", project.id); // cascades to scans + findings
  }

  console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} check(s) FAILED — review supabase/schema.sql.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
