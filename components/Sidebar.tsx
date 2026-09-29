"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/projects", label: "Projects", icon: "▤" },
  { href: "/projects/new", label: "New scan", icon: "＋" },
];

export default function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/projects" ? path === "/projects" || (path.startsWith("/projects/") && path !== "/projects/new") : path === href;

  return (
    <nav aria-label="App" className="md:w-52 md:shrink-0">
      <ul className="flex gap-1 overflow-x-auto md:sticky md:top-20 md:flex-col">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                isActive(l.href) ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <span aria-hidden className="w-4 text-center">
                {l.icon}
              </span>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
