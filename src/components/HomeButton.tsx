"use client";

import Link from "next/link";

/** Persistent link back to the public live-rallies schedule. */
export function HomeButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1 text-rally-accent text-sm font-bold hover:underline ${className}`}
    >
      ⌂ Live rallies
    </Link>
  );
}
