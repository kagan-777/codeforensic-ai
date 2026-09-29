"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredExplanation } from "@/types/database";
import { normalizeExplanation } from "@/lib/utils/explanation";
import LoadingState from "./LoadingState";
import CodeFix from "./CodeFix";

/**
 * Fetches (or re-generates) the Gemini explanation for one finding, including
 * a suggested safer version of the code. The Gemini key is only used on the
 * server — this component calls our own API.
 */
export default function AiExplanation({
  findingId,
  initial,
  codeSnippet,
  snippetStartLine,
  filePath,
}: {
  findingId: string;
  initial: unknown;
  codeSnippet: string;
  snippetStartLine: number;
  filePath: string;
}) {
  const saved = normalizeExplanation(initial);
  // Explanations saved before code suggestions existed are generated again automatically.
  const usable = saved && saved.fixedCode !== undefined ? saved : null;

  const [explanation, setExplanation] = useState<StoredExplanation | null>(usable);
  const [loading, setLoading] = useState(usable === null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (regenerate: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/findings/${findingId}/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate }),
        });
        const data = (await res.json()) as { explanation?: unknown; error?: string };
        const value = normalizeExplanation(data.explanation);
        if (!res.ok || !value) throw new Error(data.error ?? "Could not generate an explanation.");
        setExplanation(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not generate an explanation.");
      } finally {
        setLoading(false);
      }
    },
    [findingId],
  );

  // Generate once on first view (the ref prevents a duplicate call in React dev mode).
  const started = useRef(false);
  useEffect(() => {
    if (usable === null && !started.current) {
      started.current = true;
      void load(false);
    }
  }, [usable, load]);

  return (
    <section aria-labelledby="ai-heading" className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ai-heading" className="font-semibold">
          AI explanation
        </h2>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Gemini · based only on the evidence above</span>
        {explanation && !loading && (
          <button onClick={() => void load(true)} className="ml-auto text-xs font-medium text-muted hover:text-accent">
            Regenerate
          </button>
        )}
      </div>

      {loading && <LoadingState label="Generating a beginner-friendly explanation and a safer code suggestion…" />}

      {error && !loading && (
        <div role="alert" className="mt-4 rounded-lg border border-medium/40 bg-medium/10 p-4 text-sm text-medium">
          <p>{error}</p>
          <button onClick={() => void load(false)} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {explanation && !loading && (
        <div className="mt-4 space-y-5 text-sm leading-relaxed">
          <Block title="What was detected?" text={explanation.summary} />
          <Block title="Why might it be risky?" text={explanation.whyRisky} />
          <Block title="Which code caused the finding?" text={explanation.evidenceExplanation} />
          <Block title="Recommended improvement" text={explanation.recommendation} accent />

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">Suggested safer code</h3>
            {explanation.fixedCode ? (
              <CodeFix
                original={codeSnippet}
                fixed={explanation.fixedCode}
                startLine={snippetStartLine}
                filePath={filePath}
                stillFlagged={explanation.fixStillFlagged === true}
                removedNames={explanation.fixRemovedNames ?? []}
              />
            ) : (
              <p className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted">
                No automatic code suggestion for this finding — the fix needs more context than these few lines. Follow
                the recommendation above, or click Regenerate to try again.
              </p>
            )}
          </div>

          <p className={`rounded-lg px-4 py-3 text-xs ${explanation.manualReview ? "bg-medium/10 text-medium" : "bg-surface-2 text-muted"}`}>
            {explanation.manualReview
              ? "Manual review required: the evidence alone is not enough to judge this risk. Please check the code yourself or ask a mentor."
              : "Manual review is still recommended. This is an automated explanation of a detected pattern, not a confirmed vulnerability."}
          </p>
        </div>
      )}
    </section>
  );
}

function Block({ title, text, accent }: { title: string; text: string; accent?: boolean }) {
  return (
    <div>
      <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wider ${accent ? "text-accent" : "text-muted"}`}>{title}</h3>
      <p className="whitespace-pre-line text-text">{text || "—"}</p>
    </div>
  );
}
