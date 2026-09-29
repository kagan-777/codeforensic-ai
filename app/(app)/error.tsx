"use client";

// Friendly error page for the app area. Internal details are never shown.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-high/40 bg-high/10 p-6">
      <h2 className="font-semibold text-high">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted">
        We could not load this page. Check that Supabase is configured (see the README) and try again.
      </p>
      <button onClick={reset} className="mt-4 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-accent">
        Try again
      </button>
    </div>
  );
}
