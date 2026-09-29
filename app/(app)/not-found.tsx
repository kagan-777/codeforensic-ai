import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-1 text-sm text-muted">This item does not exist, or it belongs to another account.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
        Go to dashboard
      </Link>
    </div>
  );
}
