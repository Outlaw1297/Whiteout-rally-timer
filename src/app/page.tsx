import Link from "next/link";
import { CreateRallyForm, TestRallyButtons } from "@/components/CreateRallyForm";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-rally-accent mb-1">
          ⚔️ WHITEOUT RALLY TIMER
        </h1>
        <p className="text-rally-muted text-sm">Server-authoritative timing</p>
      </header>

      <section className="w-full flex flex-col items-center gap-8">
        <h2 className="text-lg font-bold text-rally-muted">CREATE RALLY</h2>
        <CreateRallyForm />
      </section>

      <div className="w-full max-w-md my-8 border-t border-rally-border" />

      <TestRallyButtons />

      <footer className="mt-auto pt-8">
        <Link
          href="/debug"
          className="text-rally-muted text-xs hover:text-rally-accent"
        >
          Debug / Health
        </Link>
      </footer>
    </main>
  );
}
