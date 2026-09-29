import type { ReactNode } from "react";
import { Logo } from "./Navbar";

/** Split-screen layout for login / signup: 3D visual on the left (large screens), form on the right. */
export default function AuthShell({
  title,
  subtitle,
  visual,
  children,
}: {
  title: string;
  subtitle: string;
  visual: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative grid min-h-screen lg:grid-cols-2">
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0" />

      <section className="relative hidden flex-col justify-between border-r border-line/60 p-10 lg:flex">
        <Logo />
        <div className="relative mx-auto aspect-square w-full max-w-[460px]">
          {visual}
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight">
            <span className="text-gradient">Detect → Understand → Improve</span>
          </p>
          <p className="mt-2 max-w-md text-sm text-muted">
            Deterministic static analysis finds the evidence. AI explains it in plain language.
          </p>
        </div>
      </section>

      <section className="relative flex flex-col items-center justify-center px-4 py-12">
        <div className="mb-2 h-40 w-full max-w-sm lg:hidden">{visual}</div>
        <div className="glass w-full max-w-sm rounded-2xl p-7">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight lg:mt-0">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
