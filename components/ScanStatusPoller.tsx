"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a scan is QUEUED/SCANNING, poll GET /api/scans/[id] and refresh when it finishes. */
export default function ScanStatusPoller({ scanId }: { scanId: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { scan?: { status?: string } };
        if (data.scan?.status === "COMPLETED" || data.scan?.status === "FAILED") {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // network hiccup — try again on the next tick
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [scanId, router]);
  return null;
}
