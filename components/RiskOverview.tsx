import type { SeverityCounts } from "@/types/scanner";

/**
 * Risk overview built only from real scan counts:
 *  - a gauge with a weighted "risk index" (HIGH×10 + MEDIUM×4 + LOW×1, capped at 100)
 *  - a stacked bar showing the HIGH / MEDIUM / LOW split
 * The formula is shown to the user — it is a summary, not a security guarantee.
 */
export function riskIndex({ high, medium, low }: SeverityCounts): number {
  return Math.min(100, high * 10 + medium * 4 + low);
}

function band(index: number): { label: string; tone: string; color: string } {
  if (index === 0) return { label: "No patterns detected", tone: "text-accent", color: "var(--color-accent)" };
  if (index <= 20) return { label: "Low", tone: "text-low", color: "var(--color-low)" };
  if (index <= 50) return { label: "Elevated", tone: "text-medium", color: "var(--color-medium)" };
  return { label: "High", tone: "text-high", color: "var(--color-high)" };
}

export default function RiskOverview({ high, medium, low, title = "Risk overview" }: SeverityCounts & { title?: string }) {
  const index = riskIndex({ high, medium, low });
  const b = band(index);
  const total = high + medium + low;

  // Semicircle gauge geometry
  const r = 80;
  const arc = Math.PI * r; // length of the half circle
  const filled = (index / 100) * arc;

  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <section aria-labelledby="risk-title" className="glass rounded-2xl p-5">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative w-52 shrink-0">
          <svg viewBox="0 0 200 115" className="w-full" role="img" aria-label={`Risk index ${index} out of 100: ${b.label}`}>
            <defs>
              <linearGradient id="gauge-grad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="var(--color-accent)" />
                <stop offset="50%" stopColor="var(--color-medium)" />
                <stop offset="100%" stopColor="var(--color-high)" />
              </linearGradient>
            </defs>
            <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--color-line)" strokeWidth="14" strokeLinecap="round" />
            <path
              d="M20 100 A80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#gauge-grad)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${arc}`}
              style={{ filter: "drop-shadow(0 0 6px rgba(46,230,197,.35))" }}
            />
          </svg>
          <div className="absolute inset-x-0 bottom-1 text-center">
            <p className="font-mono text-4xl font-bold">{index}</p>
            <p className={`text-xs font-semibold uppercase tracking-widest ${b.tone}`}>{b.label}</p>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1">
          <h2 id="risk-title" className="font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Risk index = HIGH×10 + MEDIUM×4 + LOW×1 (max 100). A summary of detected patterns — not a guarantee of
            real-world risk or safety.
          </p>

          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="bg-high" style={{ width: `${pct(high)}%` }} />
            <div className="bg-medium" style={{ width: `${pct(medium)}%` }} />
            <div className="bg-low" style={{ width: `${pct(low)}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {(
              [
                ["High", high, "bg-high", "text-high"],
                ["Medium", medium, "bg-medium", "text-medium"],
                ["Low", low, "bg-low", "text-low"],
              ] as const
            ).map(([label, n, dot, tone]) => (
              <div key={label} className="rounded-lg bg-surface-2/70 px-3 py-2">
                <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
                  <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                  {label}
                </dt>
                <dd className={`font-mono text-lg font-semibold ${tone}`}>
                  {n} <span className="text-xs font-normal text-muted">({Math.round(pct(n))}%)</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
