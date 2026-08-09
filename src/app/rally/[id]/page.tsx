import { RallyView } from "@/components/RallyView";
import Link from "next/link";

interface PageProps {
  params: { id: string };
  searchParams: { debug?: string };
}

export default function RallyPage({ params, searchParams }: PageProps) {
  const { id } = params;
  const { debug } = searchParams;

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <Link
        href="/"
        className="self-start text-rally-muted text-sm hover:text-rally-accent mb-6"
      >
        ← Back
      </Link>
      <RallyView rallyId={id} showDebug={debug === "1"} />
    </main>
  );
}
