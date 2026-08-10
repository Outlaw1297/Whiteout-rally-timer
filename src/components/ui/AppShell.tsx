import type { ReactNode } from "react";

/** Consistent page frame: safe-area aware, mobile-first, widens on large screens. */
export function AppShell({
  children,
  wide = false,
  className = "",
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <main
      className={`min-h-[100dvh] w-full px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
        wide ? "max-w-5xl" : "max-w-lg"
      } mx-auto ${className}`}
    >
      {children}
    </main>
  );
}

export function AppHeader({
  left,
  right,
  className = "",
}: {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex items-start justify-between gap-3 mb-5 ${className}`}
    >
      <div className="min-w-0">{left}</div>
      {right ? (
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap justify-end">
          {right}
        </div>
      ) : null}
    </header>
  );
}

export function Panel({
  children,
  className = "",
  accent = false,
  launch = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  launch?: boolean;
}) {
  return (
    <section
      className={`rounded-xl p-4 ${
        launch
          ? "bg-rally-launch/15 border-2 border-rally-launch motion-safe:animate-launch-pulse"
          : accent
            ? "bg-rally-ice/10 border border-rally-ice/40"
            : "bg-rally-surface border border-rally-border"
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rally-muted">
      {children}
    </p>
  );
}
