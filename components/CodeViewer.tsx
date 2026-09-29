/** Read-only code viewer with line numbers; the reported line is highlighted. */
export default function CodeViewer({
  code,
  startLine,
  highlightLine,
  filePath,
}: {
  code: string;
  startLine: number;
  highlightLine: number;
  filePath: string;
}) {
  const lines = code.split("\n");
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-[#05080e]">
      <figcaption className="flex items-center justify-between border-b border-line px-4 py-2 font-mono text-xs text-muted">
        <span className="truncate">{filePath}</span>
        <span className="shrink-0">
          lines {startLine}–{startLine + lines.length - 1}
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="min-w-full py-2 font-mono text-[13px] leading-6">
          <code>
            {lines.map((line, i) => {
              const n = startLine + i;
              const hit = n === highlightLine;
              return (
                <div
                  key={n}
                  className={`flex ${hit ? "bg-high/10 shadow-[inset_3px_0_0_var(--color-high)]" : ""}`}
                  aria-current={hit ? "true" : undefined}
                >
                  <span className={`w-14 shrink-0 select-none pr-4 text-right ${hit ? "text-high" : "text-muted/60"}`}>{n}</span>
                  <span className="whitespace-pre pr-4">{line || " "}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </figure>
  );
}
