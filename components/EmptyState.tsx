import Link from "next/link";

export default function EmptyState({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="glass rounded-2xl border-dashed px-6 py-14 text-center">
      <div aria-hidden className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 font-mono text-accent">
        {"</>"}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-strong"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
