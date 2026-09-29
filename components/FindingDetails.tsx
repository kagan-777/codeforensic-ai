import Link from "next/link";
import type { FindingRow } from "@/types/database";
import SeverityBadge, { ConfidenceLabel } from "./SeverityBadge";
import CodeViewer from "./CodeViewer";
import AiExplanation from "./AiExplanation";
import PageHero from "./PageHero";
import Scene3D from "./Scene3D";

/** Full view of one finding: facts from the static analyzer first, AI explanation second. */
export default function FindingDetails({ finding, projectName }: { finding: FindingRow; projectName?: string }) {
  return (
    <div className="space-y-6">
      <Link href={`/scans/${finding.scan_id}`} className="text-sm text-muted hover:text-accent">
        ← Back to scan{projectName ? ` · ${projectName}` : ""}
      </Link>
      <PageHero
        eyebrow="FINDING DETAILS"
        title={finding.title}
        subtitle={
          <>
            <span className="flex flex-wrap items-center gap-3">
              <SeverityBadge severity={finding.severity} size="md" />
              <ConfidenceLabel confidence={finding.confidence} />
              <span className="font-mono text-xs text-muted">{finding.rule_id}</span>
            </span>
            <span className="mt-2 block break-all font-mono text-sm text-accent">
              {finding.file_path} : Line {finding.line_number}
            </span>
          </>
        }
        visual={<Scene3D scene="lens" data={{ severity: finding.severity }} />}
      />

      <CodeViewer
        code={finding.code_snippet}
        startLine={finding.snippet_start_line}
        highlightLine={finding.line_number}
        filePath={finding.file_path}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Evidence (static analyzer)</h2>
          <p className="mt-2 text-sm leading-relaxed">{finding.evidence}</p>
        </section>
        <section className="glass rounded-2xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Why is this risky?</h2>
          <p className="mt-2 text-sm leading-relaxed">{finding.description}</p>
        </section>
      </div>

      <section className="rounded-xl border border-accent/30 bg-accent/5 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">Rule recommendation</h2>
        <p className="mt-2 text-sm leading-relaxed">{finding.recommendation}</p>
      </section>

      <AiExplanation
        findingId={finding.id}
        initial={finding.ai_explanation}
        codeSnippet={finding.code_snippet}
        snippetStartLine={finding.snippet_start_line}
        filePath={finding.file_path}
      />

      <p className="text-xs leading-relaxed text-muted">
        Severity comes from the rule definition and confidence describes how strongly the pattern matched. Neither is a
        guarantee of real-world impact — this is a potential risk pattern that needs human review.
      </p>
    </div>
  );
}
