import type { SeverityCounts } from "@/types/scanner";

export interface DashboardStatsProps extends SeverityCounts {
  filesScanned: number;
  languages: number;
  findings: number;
}

const ICONS = {
  files: "M6 2h9l5 5v15H6z M15 2v5h5",
  lang: "M8 6l-6 6 6 6 M16 6l6 6-6 6",
  find: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3",
  high: "M12 3l10 18H2z M12 10v4 M12 17.5v.5",
  medium: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v5 M12 16.5v.5",
  low: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12h8",
} as const;

function Stat({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: keyof typeof ICONS }) {
  return (
    <div className="glass group relative overflow-hidden rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ background: `var(--color-${tone})` }}
      />
      <div className="flex items-center justify-between">
        <dt className="text-[11px] font-medium uppercase tracking-widest text-muted">{label}</dt>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={`var(--color-${tone})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={ICONS[icon]} />
        </svg>
      </div>
      <dd className="mt-2 font-mono text-3xl font-semibold" style={{ color: tone === "text" ? undefined : `var(--color-${tone})` }}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/** All numbers come from real scan records — nothing here is hardcoded. */
export default function DashboardStats(p: DashboardStatsProps) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Files scanned" value={p.filesScanned} tone="text" icon="files" />
      <Stat label="Languages" value={p.languages} tone="violet" icon="lang" />
      <Stat label="Findings" value={p.findings} tone="accent" icon="find" />
      <Stat label="High" value={p.high} tone="high" icon="high" />
      <Stat label="Medium" value={p.medium} tone="medium" icon="medium" />
      <Stat label="Low" value={p.low} tone="low" icon="low" />
    </dl>
  );
}
