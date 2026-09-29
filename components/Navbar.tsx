import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest">
      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-[0_0_16px_-4px_var(--color-accent)] ring-1 ring-accent/40">
        ⌖
      </span>
      CODEFORENSIC<span className="text-accent">AI</span>
    </Link>
  );
}

/** Top bar. Shows login/signup for visitors, email + logout for users. */
export default function Navbar({ email }: { email?: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6" aria-label="Main">
        <Logo />
        <div className="ml-auto flex items-center gap-3 text-sm">
          {email ? (
            <>
              <span className="hidden max-w-[220px] truncate text-muted sm:inline">{email}</span>
              <form action="/auth/signout" method="post">
                <button className="rounded-lg border border-line px-3 py-1.5 font-medium hover:border-high hover:text-high">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="px-2 py-1.5 font-medium text-muted hover:text-text">
                Log in
              </Link>
              <Link href="/signup" className="btn-glow rounded-lg bg-accent px-3 py-1.5 font-semibold text-bg hover:bg-accent-strong">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
