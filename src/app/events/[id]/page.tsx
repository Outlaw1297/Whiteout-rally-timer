"use client";

import { PublicTopNav } from "@/components/PublicTopNav";
import { PublicRallyLiveView } from "@/components/PublicRallyLiveView";
import { AppShell } from "@/components/ui/AppShell";

export default function PublicEventPage({ params }: { params: { id: string } }) {
  return (
    <AppShell className="page-enter" wide>
      <div className="max-w-lg mx-auto w-full md:max-w-none">
        <PublicTopNav />
        <PublicRallyLiveView eventId={params.id} />
        <p className="text-rally-muted text-xs text-center mt-4 mb-4">
          No login required — watch this page for your launch countdown.
        </p>
      </div>
    </AppShell>
  );
}
