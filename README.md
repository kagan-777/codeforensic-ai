# CODEFORENSIC AI

**Understand the security risks hiding in your code.**
Evidence-based static analysis with AI-powered security explanations for students and beginner developers.

> **Detect → Understand → Improve**

---

## Project overview

CODEFORENSIC AI lets a developer upload a project as a ZIP file. A **deterministic static analyzer** looks
for a focused set of potential security-risk patterns and records exact evidence (file, line, code, why the
rule triggered). Then **Gemini explains each finding** in beginner-friendly language and suggests a safer
approach. After improving the code, the developer uploads it again and sees what changed.

## Problem statement

Students and beginner developers can build working software, but often don't yet have the security
knowledge to spot, understand and fix risky code patterns.

## Solution

```
SOURCE CODE → DETERMINISTIC STATIC ANALYZER → EVIDENCE → LLM → EXPLANATION + REMEDIATION
```

- **Detection = static analysis.** Rules are plain TypeScript; the same code always gives the same findings.
- **Explanation = AI.** Gemini only receives one finding's evidence plus a small, redacted code window.
  It is never used to detect issues and cannot change file, line, rule, severity, confidence or evidence.
- Wording is always "potential … pattern". The app never claims a vulnerability is confirmed or that a
  project is secure.

## Features

- Sign up / log in / log out (Supabase Auth); every page and API route is protected.
- ZIP upload with drag & drop, file name/size preview, remove, client + server validation.
- Safe ZIP handling: path-traversal/absolute-path rejection, ZIP-bomb detection, size/entry limits,
  symlink & encrypted-entry skipping, CRC checks. **Nothing is ever executed.**
- Language/file detection (Java, JavaScript, TypeScript, Python, SQL, HTML, JSON, YAML, .properties, .env,
  ini/cfg/conf/toml) and dependency/build-folder filtering.
- Five rule families, each finding with file, line, snippet, evidence, severity and confidence:
  1. Potential Hardcoded Secret (HIGH)
  2. Potential SQL Injection Pattern (HIGH)
  3. Potentially Dangerous Function Usage (MEDIUM)
  4. Potential Sensitive Information Exposure (MEDIUM)
  5. Potential Insecure Configuration (LOW/MEDIUM — debug mode, Flask debug server, disabled TLS
     verification, wildcard CORS, exposed Spring Actuator, `ALLOWED_HOSTS = ['*']`)
- Real-time scan progress streamed from the server (Validating → Extracting → Detecting → Analyzing →
  Saving → Completed), scan status `QUEUED / SCANNING / COMPLETED / FAILED`.
- Dashboard with real statistics, project list, finding cards, severity filter.
- Finding details page with a line-numbered code viewer, highlighted line, evidence, rule
  recommendation and the AI explanation (cached after the first generation, can be regenerated).
- Gemini response validation: strict JSON schema, no over-claiming ("confirmed vulnerability",
  "100% secure"…), no invented line numbers or file names, retry once, friendly errors.
- Secret redaction before storage and before anything is sent to Gemini.
- Rescan: new scan record every time (old scans kept), comparison with the previous scan
  (previous / current / new / no-longer-detected).
- Row Level Security so users can only ever see their own data.

## Architecture

```
Browser (Next.js pages, React)                     Server (Next.js route handlers, Node.js runtime)
──────────────────────────────                     ──────────────────────────────────────────────
UploadProject ── POST ZIP (multipart) ───────────▶ /api/projects/upload, /api/projects/[id]/rescan
     ▲                                                 │  lib/scan/upload-handler.ts (auth, limits)
     └──── NDJSON progress events ◀────────────────── │  lib/scan/pipeline.ts
                                                       │    ├─ lib/zip/safe-zip.ts        (safe ZIP reader)
                                                       │    ├─ lib/scanner/file-detector.ts
                                                       │    ├─ lib/scanner/scanner.ts      (runs rules)
                                                       │    │     └─ 5 rule files
                                                       │    └─ lib/supabase/scan-store.ts (DB writes, RLS)
AiExplanation ── POST /api/findings/[id]/explain ─▶ lib/ai/gemini.ts → prompt.ts → Gemini API
                                                          └─ validate.ts (checks the answer)
Supabase: Auth + Postgres (profiles, projects, scans, findings) with Row Level Security
```

### Folder structure

```
app/
  page.tsx                   landing page
  login/  signup/            auth pages
  (app)/                     protected area (layout checks login)
    dashboard/  projects/  projects/new/  projects/[id]/  scans/[id]/  findings/[id]/
  api/
    projects/upload/         POST  new project + first scan
    projects/[id]/rescan/    POST  new scan for an existing project
    scans/                   POST  same as upload (?projectId= for rescan)
    scans/[id]/              GET   scan + findings + comparison
    findings/[id]/           GET   one finding
    findings/[id]/explain/   POST  Gemini explanation
  auth/signout, auth/confirm
components/                  Navbar, Sidebar, UploadProject, ScanProgress, DashboardStats, FindingCard,
                             FindingList, FindingDetails, AiExplanation, SeverityBadge, CodeViewer,
                             ProjectList, EmptyState, LoadingState, AuthForm, ScanStatusPoller
lib/
  zip/safe-zip.ts            dependency-free, limit-enforcing ZIP reader
  scanner/                   file-detector, project-analyzer, text-utils, security-rules, 5 rules,
                             scanner, compare
  scan/                      pipeline (orchestration), upload-handler, queries
  ai/                        gemini (server-only), prompt, validate
  supabase/                  client, server, middleware, scan-store, env
  utils/                     redact, rate-limit, format
types/                       scanner.ts, database.ts
supabase/schema.sql          tables, indexes, RLS policies, grants
supabase/tests/              optional local-Postgres RLS test
tests/                       node:test suites (rules, zip, utils/AI validation, pipeline)
scripts/                     scan-zip (CLI), build-demo-zip, test-isolation
demo-project/                INTENTIONALLY INSECURE demo project + fixed version (+ ZIPs)
```

## Tech stack

Next.js 15 (App Router, Route Handlers) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth,
`@supabase/ssr`) · Gemini API (REST, server-side only) · Node.js built-in test runner.

No ZIP library is used: `lib/zip/safe-zip.ts` reads ZIPs with Node's built-in `zlib`, so every safety limit is
under our control.

## Installation

Requirements: **Node.js 22.2 or newer** (check with `node -v`), a free Supabase account, a Gemini API key.

```bash
cd codeforensic-ai
npm install
cp .env.local.example .env.local      # Windows: copy .env.local.example .env.local
```

## Environment variables

| Variable | Where it is used | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Supabase → Project Settings → API Keys → *publishable* key (`sb_publishable_…`). Older projects: the `anon` public key also works here. |
| `GEMINI_API_KEY` | **server only** | Google AI Studio → Get API key |
| `GEMINI_MODEL` (optional) | server only | defaults to `gemini-2.5-flash` |

The publishable key is designed to be public; your data is protected by Row Level Security.
The Gemini key has **no** `NEXT_PUBLIC_` prefix, so Next.js never sends it to the browser.
`.env.local` is in `.gitignore` — never commit it.

## Supabase setup

1. Create a project at <https://supabase.com>.
2. **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. (Safe to re-run.)
3. **Authentication → URL Configuration**: set *Site URL* to `http://localhost:3000` and add
   `http://localhost:3000/auth/confirm` to *Redirect URLs*.
4. Optional for local testing: **Authentication → Sign In / Providers → Email** → turn off *Confirm email*
   so new accounts can log in immediately.
5. Copy the project URL and publishable key into `.env.local`.

## Gemini setup

1. Go to <https://aistudio.google.com/apikey> and create an API key.
2. Put it in `.env.local` as `GEMINI_API_KEY=...`.
3. Restart `npm run dev` after changing `.env.local`.

If the key is missing, the rest of the app still works; the explanation panel shows a friendly message.

## Database schema

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth user), `email`, `created_at` — created automatically by a trigger on sign-up |
| `projects` | `id`, `user_id`, `name`, `original_filename`, `file_count`, `languages text[]`, `created_at`, `updated_at` |
| `scans` | `id`, `project_id`, `user_id`, `previous_scan_id`, `status` (QUEUED/SCANNING/COMPLETED/FAILED), `stage`, `started_at`, `completed_at`, `files_scanned`, `findings_count`, `high_count`, `medium_count`, `low_count`, `skipped_count`, `truncated`, `error_message`, `created_at` |
| `findings` | `id`, `scan_id`, `project_id`, `user_id`, `rule_id`, `title`, `description`, `file_path`, `line_number`, `severity`, `confidence`, `evidence`, `code_snippet`, `snippet_start_line`, `recommendation`, `language`, `fingerprint`, `ai_explanation jsonb`, `ai_model`, `ai_generated_at`, `created_at` |

Foreign keys cascade on delete. Indexes exist on `user_id`, `project_id` and `scan_id`.
RLS policies allow each user to read/write only rows where `user_id = auth.uid()`; scans can only be attached
to your own projects and findings only to your own scans. Column grants make scanner evidence read-only:
users can update only a finding's AI-explanation columns.

## Running locally

```bash
npm run dev
```

Open <http://localhost:3000>, sign up, then **Upload Project** and choose
`demo-project/CollegeManagement.zip`. Afterwards open the project and rescan with
`demo-project/CollegeManagement-fixed.zip` to see the comparison.

Other commands:

```bash
npm run scan -- demo-project/CollegeManagement.zip   # run the analyzer in the terminal (no DB/AI needed)
npm run demo:zip                                      # rebuild the demo ZIPs from the demo folders
npm run build && npm start                            # production build
npm run typecheck                                     # TypeScript check
```

## Testing

```bash
npm test                  # 58 automated tests (no Supabase/Gemini needed)
npm run test:isolation    # checks RLS on YOUR Supabase project with two test accounts
```

`npm test` covers:

- **Every rule**: positive matches, negative matches, false-positive-prone examples (placeholders, UI text,
  `model.eval()`, `regex.exec()`, parameterized queries, "select a file from…"), correct line numbers,
  severity and confidence, and that secrets never appear in evidence/snippets.
- **ZIP safety**: traversal (`../`), absolute and drive-letter paths, control characters, invalid/empty/
  corrupted/too-large ZIPs, ZIP bombs (ratio + lying size headers), symlinks, ignored folders, binaries.
- **Gemini response validation**: invalid JSON, missing fields, over-claiming, invented lines/files,
  prompt redaction.
- **Scan creation and rescan** (pipeline with an in-memory store): records, counts, stage order, no records
  for invalid ZIPs, new scan per rescan, comparison, FAILED handling, cross-user rescan blocked.

`npm run test:isolation` needs two test accounts in `.env.local`:

```
TEST_USER_A_EMAIL=...
TEST_USER_A_PASSWORD=...
TEST_USER_B_EMAIL=...
TEST_USER_B_PASSWORD=...
```

It creates data as user A, verifies user B (and logged-out visitors) cannot read, rename or attach to it,
verifies even the owner can't edit scanner evidence, then deletes the test data.
Authentication itself is exercised by this script (real sign-in) and by the pages/API routes, which reject
requests without a valid session.

## Security considerations

- **Uploaded code is data, not code.** The scanner never calls `child_process`, never runs `npm`, `python`,
  `java`, scripts or binaries. Files are decompressed **in memory** and read as UTF-8 text; nothing is written
  to disk, so there is no extraction folder to escape from or clean up.
- **ZIP limits:** 10 MB upload, 5,000 entries, 60 MB total decompressed, 512 KB per analyzed file, 2,000
  analyzed files, compression ratio > 200:1 rejected, ZIP64/multi-disk rejected, sizes enforced during
  decompression, CRC verified.
- **The ZIP is not stored.** Only scan metadata, findings and short (±3 lines) code snippets are saved, with
  obvious secret values replaced by `[REDACTED]`.
- **Gemini** receives only one finding's facts and its redacted snippet — never the whole project — and only
  when the user opens that finding.
- **Identity** always comes from Supabase Auth on the server (`getUser()`); client-supplied user ids are never
  trusted. RLS enforces isolation in the database even if application code had a bug.
- Errors shown to users are friendly; stack traces and internal messages are only logged on the server.
- Basic per-user rate limits for scans and explanations (in-memory, per server instance).
- Use HTTPS in deployment (Vercel/Netlify provide it automatically).
- No encryption-at-rest or automatic deletion is claimed beyond what Supabase itself provides.

## MVP limitations

- Five pattern families only; regex/heuristic based, not full data-flow analysis — expect some false positives
  and false negatives. "No findings" never means "secure".
- SQL-injection detection does not trace whether a variable really comes from user input; confidence is
  based on variable names and direct request access.
- Multi-line constructs are handled only for simple `+` continuation lines.
- Scans run inside the upload request (fine for ZIPs up to 10 MB). **Vercel's serverless functions limit request
  bodies to about 4.5 MB**, so on Vercel keep ZIPs smaller or deploy to a Node server.
- Rate limiting is in-memory (resets on restart, not shared across servers).
- Comparison uses fingerprints (rule + file + line text); editing a flagged line counts as "no longer detected"
  plus possibly a "new" finding.

## Future improvements

Scan history charts and trends · export/PDF report · code diff between scans · project-aware Q&A · more rules
(XSS, path traversal, weak crypto, JWT misconfiguration) · AST-based analysis and taint tracking · more
languages (PHP, C#, Go) · background job queue for large projects · shared rate limiting (Redis).
