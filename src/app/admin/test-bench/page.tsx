"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — test bench was replaced by the Developer area. */
export default function TestBenchRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/developer");
  }, [router]);
  return <div className="p-8 text-center text-rally-muted">Redirecting to Developer…</div>;
}
