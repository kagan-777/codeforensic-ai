"use client";

import { useMemo, useState } from "react";
import type { FindingCard as FindingCardData } from "@/types/database";
import type { Severity } from "@/types/scanner";
import FindingCard from "./FindingCard";

/** Finding cards with a simple severity filter. */
export default function FindingList({ findings, newIds }: { findings: FindingCardData[]; newIds?: string[] }) {
  const [filter, setFilter] = useState<Severity | "ALL">("ALL");
  const isNew = useMemo(() => new Set(newIds ?? []), [newIds]);
  const shown = filter === "ALL" ? findings : findings.filter((f) => f.severity === filter);
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;

  return (
    <div>
      <div role="group" aria-label="Filter by severity" className="mb-3 flex flex-wrap gap-2">
        {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
              filter === s ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-text"
            }`}
          >
            {s === "ALL" ? `All (${findings.length})` : `${s} (${count(s)})`}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((f) => (
          <FindingCard key={f.id} finding={f} tag={isNew.has(f.id) ? "new" : undefined} />
        ))}
      </div>
    </div>
  );
}
