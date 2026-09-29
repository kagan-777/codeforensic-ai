import Link from "next/link";
import type { FindingCard as FindingCardData } from "@/types/database";
import SeverityBadge, { ConfidenceLabel } from "./SeverityBadge";

export default function FindingCard({ finding, tag }: { finding: FindingCardData; tag?: "new" | "still" | "gone" }) {
  const border =
    finding.severity === "HIGH" ? "border-l-high" : finding.severity === "MEDIUM" ? "border-l-medium" : "border-l-low";
  return (
    <article className={`glass rounded-2xl border-l-4 ${border} p-4 transition-transform duration-200 hover:-translate-y-0.5`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        {tag === "new" && <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">NEW</span>}
        {tag === "gone" && (
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">NO LONGER DETECTED</span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted">{finding.rule_id}</span>
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{finding.title}</h3>
      <p className="mt-1 break-all font-mono text-xs text-accent/90">
        {finding.file_path} : Line {finding.line_number}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{finding.evidence}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <ConfidenceLabel confidence={finding.confidence} />
        <Link
          href={`/findings/${finding.id}`}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
        >
          View details<span className="sr-only">: {finding.title} in {finding.file_path}</span>
        </Link>
      </div>
    </article>
  );
}
