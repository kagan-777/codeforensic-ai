import Link from "next/link";
import Navbar from "@/components/Navbar";
import ScannerOrb from "@/components/ScannerOrb";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  { name: "Upload", text: "Drop your project ZIP. It is read as text only — never executed." },
  { name: "Analyze", text: "Unsafe paths and ZIP bombs are blocked; files and languages are detected." },
  { name: "Detect", text: "Deterministic rules find risk patterns with exact file, line and evidence." },
  { name: "Explain", text: "Gemini explains each finding in plain language — using only the evidence." },
  { name: "Improve", text: "Review the suggested safer code, side by side with your own." },
  { name: "Rescan", text: "Upload again and compare: new vs. no-longer-detected findings." },
];

const RULES: { title: string; text: string; sev: "HIGH" | "MEDIUM" | "LOW" }[] = [
  { title: "Hardcoded secrets", text: "Passwords, API keys and tokens written into code or config.", sev: "HIGH" },
  { title: "SQL injection patterns", text: "Queries built by gluing variables into SQL text.", sev: "HIGH" },
  { title: "Dangerous functions", text: "eval, exec, os.system, Runtime.exec and friends.", sev: "MEDIUM" },
  { title: "Sensitive output", text: "Printing or logging passwords, tokens and secrets.", sev: "MEDIUM" },
  { title: "Insecure configuration", text: "Debug mode, disabled TLS checks, wildcard CORS…", sev: "LOW" },
];

const SEV_STYLE = {
  HIGH: "text-high bg-high/10 ring-high/30",
  MEDIUM: "text-medium bg-medium/10 ring-medium/30",
  LOW: "text-low bg-low/10 ring-low/30",
};

async function currentEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null; // Supabase not configured yet — landing page still works
  }
}

export default async function LandingPage() {
  const email = await currentEmail();
  const primaryHref = email ? "/projects/new" : "/signup";

  return (
    <>
      <Navbar email={email} />
      <main className="overflow-hidden">
        {/* ------------------------------------------------------------ HERO */}
        <section className="relative">
          <div aria-hidden className="grid-backdrop absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:pb-24 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[11px] font-semibold tracking-widest text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
                EVIDENCE-FIRST SECURITY ANALYSIS
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                <span className="text-gradient">Understand the security risks hiding in your code.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                Evidence-based static analysis with AI-powered security explanations for students and beginner
                developers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={primaryHref}
                  className="btn-glow rounded-xl bg-accent px-6 py-3 font-semibold text-bg transition-colors hover:bg-accent-strong"
                >
                  Upload Project →
                </Link>
                <a
                  href="#how-it-works"
                  className="rounded-xl border border-line bg-surface/60 px-6 py-3 font-semibold backdrop-blur hover:border-accent hover:text-accent"
                >
                  How It Works
                </a>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3">
                {[
                  ["5", "rule families"],
                  ["11", "file types"],
                  ["0", "lines executed"],
                ].map(([n, label]) => (
                  <div key={label} className="glass rounded-xl px-4 py-3">
                    <dt className="sr-only">{label}</dt>
                    <dd className="font-mono text-2xl font-bold text-accent">{n}</dd>
                    <p className="text-xs text-muted">{label}</p>
                  </div>
                ))}
              </dl>
            </div>

            {/* 3D scanner visual */}
            <div className="relative mx-auto aspect-square w-full max-w-[560px]">
              <ScannerOrb />
              <div className="glass animate-float absolute left-0 top-[12%] hidden rounded-xl px-3 py-2 text-xs sm:block">
                <p className="font-mono text-[10px] text-muted">example finding</p>
                <p className="mt-0.5 font-semibold">
                  <span className="text-high">HIGH</span> · Potential SQL Injection Pattern
                </p>
                <p className="font-mono text-[11px] text-accent">Database.java : Line 22</p>
              </div>
              <div
                className="glass animate-float absolute bottom-[14%] right-0 hidden rounded-xl px-3 py-2 text-xs sm:block"
                style={{ animationDelay: "-3s" }}
              >
                <p className="font-mono text-[10px] text-muted">evidence</p>
                <p className="mt-0.5 font-mono text-[11px]">
                  <span className="text-muted">&quot;…WHERE id=&quot;</span> <span className="text-high">+ userId</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- HOW IT WORKS */}
        <section id="how-it-works" className="scroll-mt-16 border-y border-line/60 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <p className="font-mono text-xs font-semibold tracking-widest text-accent">HOW IT WORKS</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight">
              Detect <span className="text-muted">→</span> Understand <span className="text-muted">→</span> Improve
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Detection is done by a deterministic static analyzer. The AI only explains what the analyzer found — it is
              never the detector.
            </p>

            <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-px bg-linear-to-r from-accent/0 via-accent/50 to-violet/0 lg:block" />
              {STEPS.map((s, i) => (
                <li key={s.name} className="relative">
                  <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-accent/40 bg-bg font-mono text-sm font-bold text-accent shadow-[0_0_20px_-5px_var(--color-accent)]">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mt-4 font-semibold">{s.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------ ARCHITECTURE */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="glass rounded-2xl p-6 sm:p-8">
            <p className="font-mono text-xs font-semibold tracking-widest text-accent">ARCHITECTURE</p>
            <div className="mt-6 flex flex-col items-stretch gap-3 font-mono text-xs sm:text-sm lg:flex-row lg:items-center">
              {["SOURCE CODE", "STATIC ANALYZER", "EVIDENCE", "LLM (Gemini)", "EXPLANATION + FIX"].map((label, i, arr) => (
                <div key={label} className="flex items-center gap-3 lg:flex-1">
                  <div
                    className={`flex-1 rounded-xl border px-4 py-3 text-center ${
                      i === 1 ? "border-accent/60 bg-accent/10 text-accent" : i === 3 ? "border-violet/50 bg-violet/10 text-violet" : "border-line bg-surface"
                    }`}
                  >
                    {label}
                  </div>
                  {i < arr.length - 1 && <span className="hidden text-accent lg:inline">→</span>}
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <p className="rounded-xl bg-accent/5 p-4">
                <span className="font-semibold text-accent">Detection = static analysis.</span>{" "}
                <span className="text-muted">Same code, same result. File, line, severity and evidence are never invented.</span>
              </p>
              <p className="rounded-xl bg-violet/5 p-4">
                <span className="font-semibold text-violet">Explanation = AI.</span>{" "}
                <span className="text-muted">Only the finding&apos;s evidence is sent. Answers are validated before you see them.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- RULES */}
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <p className="font-mono text-xs font-semibold tracking-widest text-accent">WHAT IT LOOKS FOR</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Five focused, explainable rule families</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {RULES.map((r) => (
              <li key={r.title} className="glass rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-1">
                <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ring-1 ring-inset ${SEV_STYLE[r.sev]}`}>
                  {r.sev}
                </span>
                <h3 className="mt-3 font-semibold">{r.title}</h3>
                <p className="mt-1 text-sm text-muted">{r.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted">
            Supported: Java, JavaScript, TypeScript, Python, SQL, HTML, JSON, YAML, .properties and .env/config files.
            CODEFORENSIC AI reports <em>potential</em> risk patterns. It does not confirm vulnerabilities and cannot
            guarantee that a project is secure.
          </p>
        </section>

        {/* ------------------------------------------------------ CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-linear-to-br from-accent/15 via-surface to-violet/15 p-8 text-center sm:p-12">
            <h2 className="text-3xl font-bold tracking-tight">Scan your first project in under a minute.</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              Try it with the included demo project — intentionally insecure test code with all five patterns.
            </p>
            <Link
              href={primaryHref}
              className="btn-glow mt-8 inline-flex rounded-xl bg-accent px-6 py-3 font-semibold text-bg hover:bg-accent-strong"
            >
              Upload Project →
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        CODEFORENSIC AI · Detect → Understand → Improve
      </footer>
    </>
  );
}
