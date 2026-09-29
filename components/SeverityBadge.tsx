import type { Confidence, Severity } from "@/types/scanner";

const SEVERITY_STYLES: Record<Severity, string> = {
  HIGH: "bg-high/15 text-high ring-high/40",
  MEDIUM: "bg-medium/15 text-medium ring-medium/40",
  LOW: "bg-low/15 text-low ring-low/40",
};

export default function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-mono font-semibold tracking-wider ring-1 ring-inset ${SEVERITY_STYLES[severity]} ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity}
      <span className="sr-only"> severity</span>
    </span>
  );
}

export function ConfidenceLabel({ confidence }: { confidence: Confidence }) {
  const bars = confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title="How strongly the analyzer's pattern matched. Not proof of a vulnerability.">
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-1 rounded-sm ${i <= bars ? "bg-accent" : "bg-line"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      Confidence: {confidence.charAt(0) + confidence.slice(1).toLowerCase()}
    </span>
  );
}
