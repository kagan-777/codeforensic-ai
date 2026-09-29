"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import ScanProgress, { type ProgressStage } from "./ScanProgress";
import { formatBytes } from "@/lib/utils/format";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB (must match lib/zip/safe-zip.ts)

type ServerEvent =
  | { type: "stage"; stage: ProgressStage; message: string }
  | { type: "complete"; scanId: string; projectId: string }
  | { type: "error"; message: string; scanId?: string };

function validate(file: File): string | null {
  if (!/\.zip$/i.test(file.name)) return "Only .zip files are supported.";
  if (file.size === 0) return "The ZIP file is empty.";
  if (file.size > MAX_BYTES) return `The ZIP file is too large (${formatBytes(file.size)}). The limit is 100 MB.`;
  return null;
}

export default function UploadProject({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ProgressStage | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = stage !== null && !failed && stage !== "completed";

  // Let the 3D upload visual react to the real scan progress.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("cf-scan-stage", { detail: failed ? null : stage }));
  }, [stage, failed]);

  function pick(f: File | undefined) {
    setError(null);
    setFailed(false);
    setStage(null);
    if (!f) return;
    const problem = validate(f);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!busy) pick(e.dataTransfer.files?.[0]);
  }

  function clear() {
    setFile(null);
    setError(null);
    setStage(null);
    setFailed(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function startScan() {
    if (!file) return;
    setError(null);
    setFailed(false);
    setStage("uploading");

    const body = new FormData();
    body.append("file", file);
    const url = projectId ? `/api/projects/${projectId}/rescan` : "/api/projects/upload";

    try {
      const res = await fetch(url, { method: "POST", body });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Upload failed. Please try again.");
      }

      // Read the server's progress events as they arrive.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ServerEvent;
          if (event.type === "stage") setStage(event.stage);
          else if (event.type === "complete") {
            setStage("completed");
            finished = true;
            router.push(`/scans/${event.scanId}`);
            router.refresh();
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      if (!finished) throw new Error("The connection closed before the scan finished. Please try again.");
    } catch (err) {
      setFailed(true);
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent/10 shadow-[0_0_40px_-10px_var(--color-accent)]" : "border-line bg-surface/60 backdrop-blur hover:border-accent/50"
        }`}
      >
        <div aria-hidden className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 font-mono text-lg text-accent">
          ZIP
        </div>
        <p className="font-medium">Drag and drop your project ZIP here</p>
        <p className="mt-1 text-sm text-muted">or</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="sr-only"
          aria-label="Choose a ZIP file"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <p className="mt-4 text-xs text-muted">
          .zip only · max 100 MB · the code is only read as text, never executed
        </p>
      </div>

      {file && (
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-high disabled:opacity-50"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={startScan}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Scanning…" : projectId ? "Start rescan" : "Start scan"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-high/40 bg-high/10 px-4 py-3 text-sm text-high">
          {error}
        </p>
      )}

      {stage && (
        <div className="glass rounded-2xl p-5">
          <ScanProgress current={stage} failed={failed} />
        </div>
      )}
    </div>
  );
}
