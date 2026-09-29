# Beginner's Guide — set up, run and understand CODEFORENSIC AI

This guide follows the 14 phases from the project spec. The code for every phase is already written, so for each
phase you **run a command, check the expected output, and read a short explanation** of the important files.
If something doesn't match, check the *Troubleshooting* section at the end before moving on.

---

## Phase 1 — Project setup

**What:** install the tools and libraries.

1. Install **Node.js 22 LTS** (or newer) from <https://nodejs.org>. Check it:
   ```bash
   node -v
   ```
   Expected: `v22.x.x` or higher (must be at least 22.2).
2. Unzip `codeforensic-ai.zip`, open a terminal **inside the `codeforensic-ai` folder**, and run:
   ```bash
   npm install
   ```
   Expected: it finishes with something like `added 3xx packages`. Warnings are OK; errors are not.
3. Run the tests (they don't need Supabase or Gemini):
   ```bash
   npm test
   ```
   Expected at the end: `# pass 58` and `# fail 0`.

**Why these packages?**
`next`/`react`/`react-dom` = the web framework · `@supabase/ssr` + `@supabase/supabase-js` = login and database ·
`tailwindcss` = styling · `server-only` = makes the build fail if server code (like the Gemini key) is ever
imported into browser code · `tsx` = runs TypeScript tests and scripts · `typescript` = type checking.

**Try the scanner right now** (no database needed):
```bash
npm run scan -- demo-project/CollegeManagement.zip
```
Expected: `Findings: 15 (HIGH 6 · MEDIUM 8 · LOW 1)` followed by each finding with file, line and evidence.

---

## Phase 2 — Supabase authentication

**What:** create the database and connect login.

1. Create a free project at <https://supabase.com> (pick a region near you, e.g. Mumbai).
2. In the dashboard open **SQL Editor → New query**. Open `supabase/schema.sql` in your editor, copy
   everything, paste, click **Run**. Expected: "Success. No rows returned".
3. **Authentication → URL Configuration**: Site URL = `http://localhost:3000`, and add
   `http://localhost:3000/auth/confirm` under Redirect URLs.
4. (Easier for testing) **Authentication → Sign In / Providers → Email** → switch off **Confirm email**.
5. Copy the env file and fill it in:
   ```bash
   cp .env.local.example .env.local        # Windows: copy .env.local.example .env.local
   ```
   Paste your **Project URL** into `NEXT_PUBLIC_SUPABASE_URL` and the **publishable key** (starts with
   `sb_publishable_`, or the older "anon public" key) into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
6. Start the app:
   ```bash
   npm run dev
   ```
   Expected: `Ready` and `Local: http://localhost:3000`.

**Test:** open <http://localhost:3000/signup>, create an account → you land on `/dashboard`.
Click **Log out** → you are back on the landing page. Now open `/dashboard` directly → you are redirected to
`/login`. In Supabase → **Table Editor → profiles** you should see your email.

**Important code:**
- `lib/supabase/client.ts` — the browser client used by the login/signup form (`components/AuthForm.tsx`).
- `lib/supabase/server.ts` — the server client. It reads the login cookie so every query runs *as you*.
- `middleware.ts` + `lib/supabase/middleware.ts` — refreshes the login session and sends logged-out visitors
  to `/login`.
- `lib/auth.ts` — `requirePageUser()` / `requireApiUser()`: the only way the server learns who you are. We never
  trust a user id sent from the browser.
- `supabase/schema.sql` — the tables **and the Row Level Security policies**. RLS means the *database itself*
  refuses to return another user's rows.

---

## Phase 3 — Dashboard UI

**What:** the protected layout and dashboard.

- `app/(app)/layout.tsx` — wraps every protected page; checks login, shows `Navbar` + `Sidebar`.
  (The `(app)` folder name in brackets is a Next.js *route group*: it does not appear in the URL.)
- `app/(app)/dashboard/page.tsx` — loads your projects and scans and adds up the numbers. Nothing is
  hardcoded: with no projects every number is `0` and you see "No projects yet".
- `components/DashboardStats.tsx`, `components/ProjectList.tsx`, `components/FindingCard.tsx`.

**Test:** after logging in, the dashboard shows six stat boxes, all 0, and an **Upload Project** button.

---

## Phase 4 — ZIP upload

**What:** the upload page and API.

- `components/UploadProject.tsx` — drag & drop or **Browse files**, shows the name and size, **Remove**, and
  **Start scan**. It checks `.zip` and 10 MB in the browser for quick feedback…
- `lib/scan/upload-handler.ts` — …and checks them **again on the server**, because browser checks can be
  bypassed. It also checks you are logged in and rate-limits to 10 scans per 10 minutes.
- `app/api/projects/upload/route.ts` — the endpoint `POST /api/projects/upload`.

**Test:** go to **New scan**. Try selecting a `.png` → "Only .zip files are supported." Select
`demo-project/CollegeManagement.zip` → you see its name and size.

---

## Phase 5 — Safe extraction

**What:** read the ZIP without ever running it. File: `lib/zip/safe-zip.ts`.

In simple words:
1. `readZipDirectory()` reads the ZIP's "table of contents" first — **without unpacking anything**. It
   rejects: files over 10 MB, more than 5,000 entries, paths with `../`, absolute paths (`/etc/passwd`,
   `C:\…`), control characters, ZIP64/multi-part archives, and entries whose compression ratio is suspiciously
   high (a *ZIP bomb* is a tiny file that expands to gigabytes).
2. `readEntryData()` unpacks one file **into memory** with a hard size cap: even if the ZIP lies about a file's
   size, Node's `zlib` stops at the declared size. It also verifies the file's checksum (CRC).
3. Symbolic links and encrypted entries are skipped.

Nothing is written to disk and nothing is executed — the uploaded project is only ever treated as text.

**Test:** `npm test` includes `tests/zip.test.ts` (traversal, bombs, corrupted ZIPs…). You can also try
uploading a random file renamed to `.zip` → "This file is not a valid ZIP archive."

---

## Phase 6 — File detection

**What:** decide which files to analyze. Files: `lib/scanner/file-detector.ts`, `lib/scanner/project-analyzer.ts`.

- Extension → language map (`.java` → Java, `.py` → Python, `.env` → ENV, …).
- Skips `node_modules`, `.git`, `dist`, `build`, `.next`, `target`, `venv`, `__pycache__`, lock files,
  images/videos/archives (unsupported types), files over 512 KB, and anything that looks binary.
- If everything is inside one top folder (like `CollegeManagement/`), that becomes the project name and is
  removed from displayed paths (`src/Database.java`).

---

## Phase 7 — Static security engine

**What:** the five rules. Folder: `lib/scanner/`.

| File | Rule | Severity | How confidence is decided |
|---|---|---|---|
| `secret-rule.ts` | Potential Hardcoded Secret | HIGH | HIGH for known key formats or values ≥ 8 chars with mixed characters, else MEDIUM |
| `sql-injection-rule.ts` | Potential SQL Injection Pattern | HIGH | HIGH if the variable name/usage suggests user input (`userId`, `req.query`…), MEDIUM otherwise, LOW for CONSTANTS |
| `dangerous-function-rule.ts` | Potentially Dangerous Function Usage | MEDIUM | HIGH with a dynamic argument, LOW with a fixed string |
| `sensitive-output-rule.ts` | Potential Sensitive Information Exposure | MEDIUM | HIGH for exact names (`password`, `token`), MEDIUM for partial (`userPassword`) |
| `insecure-config-rule.ts` | Potential Insecure Configuration | LOW/MEDIUM per sub-check | fixed per sub-check |

Every rule returns `{ lineNumber, confidence, evidence }`. `scanner.ts` then adds the file, a ±3 line code
snippet (with secrets replaced by `[REDACTED]`) and a *fingerprint* used later for rescan comparison.
A finding without evidence is never created.

**How false positives are reduced (examples):** placeholder values (`"your-api-key"`, `"example"`, `"test"`),
`.env.example` files, comments, `passwordLabel`/`tokenUrl` style names, strings that merely *mention* a
password, `model.eval()`, `regex.exec()`, parameterized queries, and English text like "select a file from".

**Test:** `npm test` (`tests/rules.test.ts`) and `npm run scan -- demo-project/CollegeManagement.zip`.

---

## Phase 8 — Finding storage

**What:** save results. Files: `lib/scan/pipeline.ts`, `lib/supabase/scan-store.ts`.

Order of events: validate ZIP → create project (new upload only) → create scan (`QUEUED`) → set `SCANNING` →
analyze → insert findings (in batches of 100) → set `COMPLETED` with counts → update the project's file count
and languages. If anything fails after the scan row exists, the scan becomes `FAILED` with a friendly message.
An invalid ZIP is rejected **before** anything is written, so no empty projects are left behind.

**Test:** upload the demo ZIP. In Supabase → Table Editor you should see 1 project, 1 scan (`COMPLETED`,
`findings_count` 15) and 15 findings.

---

## Phase 9 — Dashboard results

**What:** show the results. The upload page shows **live progress** — the server streams one line of JSON per
step (see `ScanProgress.tsx`). When it says *Completed* you are taken to `/scans/[id]`
(`app/(app)/scans/[id]/page.tsx`) with statistics and finding cards. Use the HIGH/MEDIUM/LOW buttons to filter.

**Test:** the dashboard now shows Files scanned 6, Languages 5, Findings 15, High 6, Medium 8, Low 1.

---

## Phase 10 — Gemini integration

**What:** explanations. Files: `lib/ai/prompt.ts`, `lib/ai/gemini.ts`, `lib/ai/validate.ts`,
`app/api/findings/[id]/explain/route.ts`.

1. Get a key at <https://aistudio.google.com/apikey>, put it in `.env.local` as `GEMINI_API_KEY=...`,
   and **restart** `npm run dev`.
2. `prompt.ts` builds a message with **only** this finding's facts and its redacted snippet.
3. `gemini.ts` (server-only) calls Gemini with a system instruction and a required JSON shape.
4. `validate.ts` rejects answers that are not the right JSON, that over-claim ("confirmed vulnerability",
   "100% secure"), or that mention line numbers/files that aren't in the evidence. One retry, then a friendly
   error. Valid explanations are saved in `findings.ai_explanation` so they aren't regenerated each visit.

---

## Phase 11 — Finding details

Click **View details** on any card (`app/(app)/findings/[id]/page.tsx`, `components/FindingDetails.tsx`).
You see: title, severity, confidence, file + line, the code viewer with the line highlighted in red, evidence,
"why is this risky?", the rule recommendation, then the AI explanation (generated automatically the first time)
and a manual-review note.

**Test:** open the SQL injection finding in `src/Database.java`. Line 22 is highlighted and the AI panel explains
prepared statements. Note the code viewer shows `DB_PASSWORD = "[REDACTED]"` on the secret finding.

---

## Phase 12 — Rescan

Open the project (**Projects → Open Project**). Under *Rescan with a new version* upload
`demo-project/CollegeManagement-fixed.zip`.

Expected: a new scan with **2 findings**, and a comparison box: Previous 15 · Current 2 · New 0 ·
No longer detected 13. The text says *"These findings are no longer detected by the current analyzer"* — it never
says the project is secure. The project's scan history now lists both scans; the old one is unchanged.

(How it works: `lib/scanner/compare.ts` compares finding fingerprints — rule + file + the text of the line — so a
finding still matches even if lines above it moved.)

---

## Phase 13 — Testing

```bash
npm test                 # 58 tests: rules, ZIP safety, redaction, AI validation, scan + rescan pipeline
npm run typecheck        # TypeScript errors, if any
npm run build            # production build
```

**User isolation on your real Supabase project:** create a second account (use a different email), add both
logins to `.env.local` (see the top of `scripts/test-isolation.ts`) and run:
```bash
npm run test:isolation
```
Expected: every line starts with `PASS` and it ends with `All isolation checks passed.`

Manual check: log in as user B and paste the URL of user A's project (`/projects/<id>`) → "Not found".

---

## Phase 14 — UI polish

Already included: dark cybersecurity theme (`app/globals.css`), responsive layout (sidebar becomes a top bar on
phones), visible keyboard focus, screen-reader labels, reduced motion support, loading and empty states,
friendly error page (`app/(app)/error.tsx`).

---

## Final acceptance checklist

| # | Step | Where to check |
|---|---|---|
| 1–3 | Sign up, log in, open dashboard | `/signup`, `/login`, `/dashboard` |
| 4–8 | Upload ZIP → validated, safely extracted, files & languages detected | upload progress steps |
| 9–12 | Analyzer runs, findings with file+line+evidence, stored in Supabase | scan page, Table Editor |
| 13 | Dashboard shows real statistics | `/dashboard` |
| 14–16 | Open a finding, Gemini explanation, remediation | `/findings/[id]` |
| 17–19 | Rescan, stored separately, comparison works | project page → rescan |
| 20 | Another user can't access your project | `npm run test:isolation` + manual URL check |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Supabase is not configured" / error page | `.env.local` missing or misspelled. Check the names, then **restart** `npm run dev`. |
| Signup says "check your email" and you can't log in | Click the email link, or turn off *Confirm email* (Phase 2 step 4). |
| `permission denied` or `violates row-level security` in the server log | `supabase/schema.sql` wasn't run completely. Run it again. |
| "AI explanations are not configured" | Add `GEMINI_API_KEY` to `.env.local` and restart. |
| "The AI service is receiving too many requests" | Free Gemini quota; wait a minute. |
| Gemini error about the model | Set `GEMINI_MODEL` to a model listed in Google AI Studio. |
| `npm test` fails with a syntax error about `--test` | Your Node.js is too old; install Node 22+. |
| Upload works locally but fails on Vercel | Vercel limits request bodies to ~4.5 MB; use a smaller ZIP. |
