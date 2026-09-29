"use client";

import { useMemo, useState } from "react";
import { diffLines } from "@/lib/utils/line-diff";

/**
 * Shows the AI's suggested safer code next to the current code:
 *  - "Changes" tab: line-by-line diff (red = remove, green = add)
 *  - "Suggested code" tab: the full replacement, ready to copy
 * The app never edits your files (it doesn't keep them) — you copy and paste the change.
 */
export default function CodeFix({
  original,
  fixed,
  startLine,
  filePath,
  stillFlagged,
  removedNames = [],
}: {
  original: string;
  fixed: string;
  startLine: number;
  filePath: string;
  stillFlagged: boolean;
  removedNames?: string[];
}) {
  const [tab, setTab] = useState<"diff" | "code">("diff");
  const [copied, setCopied] = useState(false);
  const diff = useMemo(() => diffLines(original, fixed), [original, fixed]);
  const endLine = startLine + original.split("\n").length - 1;
  const hasRedacted = fixed.includes("[REDACTED]");

  async function copy() {
    try {
      await navigator.clipboard.writeText(fixed);
    } catch {
      // Older browsers: fall back to a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = fixed;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Line numbers for the diff view: removed/same lines follow the original file.
  let oldNo = startLine;
  let newNo = startLine;

  return (
    <div className="overflow-hidden rounded-xl border border-accent/30">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <div role="tablist" aria-label="Code suggestion view" className="flex gap-1">
          {(
            [
              ["diff", "Changes"],
              ["code", "Suggested code"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                tab === id ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void copy()}
          className="ml-auto rounded-md bg-accent px-3 py-1 text-xs font-semibold text-bg hover:bg-accent-strong"
        >
          {copied ? "Copied ✓" : "Copy suggested code"}
        </button>
      </div>

      <div className="overflow-x-auto bg-[#05080e]">
        <pre className="min-w-full py-2 font-mono text-[13px] leading-6">
          <code>
            {tab === "diff"
              ? diff.map((d, i) => {
                  let n = 0;
                  if (d.type === "added") newNo++;
                  else if (d.type === "removed") n = oldNo++;
                  else {
                    n = oldNo++;
                    newNo++;
                  }
                  const style =
                    d.type === "added"
                      ? "bg-accent/10 text-accent"
                      : d.type === "removed"
                        ? "bg-high/10 text-high line-through decoration-high/40"
                        : "";
                  const mark = d.type === "added" ? "+" : d.type === "removed" ? "−" : " ";
                  return (
                    <div key={i} className={`flex ${style}`}>
                      <span className="w-12 shrink-0 select-none pr-2 text-right text-muted/60">
                        {d.type === "added" ? "" : n}
                      </span>
                      <span aria-hidden className="w-5 shrink-0 select-none text-center">
                        {mark}
                      </span>
                      <span className="sr-only">{d.type === "added" ? "added: " : d.type === "removed" ? "removed: " : ""}</span>
                      <span className="whitespace-pre pr-4">{d.text || " "}</span>
                    </div>
                  );
                })
              : fixed.split("\n").map((line, i) => (
                  <div key={i} className="flex">
                    <span className="w-12 shrink-0 select-none pr-4 text-right text-muted/60">{i + 1}</span>
                    <span className="whitespace-pre pr-4">{line || " "}</span>
                  </div>
                ))}
          </code>
        </pre>
      </div>

      <div className="space-y-2 border-t border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
        <p>
          <span className="font-semibold text-text">How to apply:</span> open{" "}
          <span className="font-mono text-accent">{filePath}</span>, select lines{" "}
          <span className="font-mono text-text">
            {startLine}–{endLine}
          </span>
          , and replace them with the suggested code. Then save, zip the project again and use <em>Rescan</em>.
        </p>
        {hasRedacted && (
          <p className="text-medium">
            The suggestion contains <span className="font-mono">[REDACTED]</span> where a secret was hidden from the AI.
            Don&apos;t paste a real secret there — store it in an environment variable instead.
          </p>
        )}
        {removedNames.length > 0 && (
          <p className="text-medium">
            ⚠ The suggestion removes{" "}
            {removedNames.map((n, i) => (
              <span key={n}>
                {i > 0 && ", "}
                <span className="font-mono">{n}</span>
              </span>
            ))}{" "}
            completely. Check that your program doesn&apos;t still need it (for example, a token that must be sent to the
            user). If it does, keep it and only stop it from being printed or logged.
          </p>
        )}
        {stillFlagged && (
          <p className="text-medium">
            Note: our analyzer still detects this pattern in the suggested code. Review it carefully before using it.
          </p>
        )}
        <p>This is an AI suggestion based only on these lines. Review and test it before using it.</p>
      </div>
    </div>
  );
}
