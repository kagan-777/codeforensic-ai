import type { ReactNode } from "react";

/**
 * Page header used on every app page: text on the left, the page's own 3D
 * visual on the right (on phones the visual sits above the text).
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  visual,
  actions,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  visual: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="glass relative overflow-hidden rounded-3xl">
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative grid items-center gap-2 md:grid-cols-[1fr_minmax(220px,300px)]">
        <div className="order-2 p-6 pt-0 md:order-1 md:p-8">
          <p className="font-mono text-[11px] font-semibold tracking-widest text-accent">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-2 max-w-xl text-sm text-muted">{subtitle}</div>}
          {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
          {children}
        </div>
        <div className="order-1 h-44 md:order-2 md:h-56">{visual}</div>
      </div>
    </section>
  );
}
