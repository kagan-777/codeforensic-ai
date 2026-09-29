"use client";

import type { ScanStage } from "@/types/scanner";

export type ProgressStage = "uploading" | Exclude<ScanStage, "failed">;

export const PROGRESS_STEPS: { stage: ProgressStage; label: string }[] = [
  { stage: "uploading", label: "Uploading…" },
  { stage: "validating", label: "Validating ZIP…" },
  { stage: "extracting", label: "Extracting files safely…" },
  { stage: "detecting", label: "Detecting files and languages…" },
  { stage: "analyzing", label: "Analyzing security patterns…" },
  { stage: "saving", label: "Saving findings…" },
  { stage: "completed", label: "Completed" },
];

/** Shows real progress: each step turns green when the server reports it. */
export default function ScanProgress({ current, failed }: { current: ProgressStage; failed: boolean }) {
  const idx = PROGRESS_STEPS.findIndex((s) => s.stage === current);
  return (
    <ol className="space-y-2" aria-live="polite">
      {PROGRESS_STEPS.map((step, i) => {
        const done = i < idx || (current === "completed" && i === idx);
        const active = i === idx && current !== "completed";
        const errored = failed && i === idx;
        return (
          <li key={step.stage} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                errored
                  ? "border-high bg-high/20 text-high"
                  : done
                    ? "border-accent bg-accent text-bg"
                    : active
                      ? "border-accent text-accent"
                      : "border-line text-muted"
              }`}
            >
              {errored ? "!" : done ? "✓" : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> : ""}
            </span>
            <span className={errored ? "text-high" : done ? "text-text" : active ? "text-accent" : "text-muted"}>
              {step.label}
            </span>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-muted">AI explanations are generated when you open a finding.</li>
    </ol>
  );
}
