"use client";

import { Suspense } from "react";
import { DeviceOnboardingWizard } from "@/components/DeviceOnboardingWizard";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center text-rally-muted text-sm">
          Loading setup…
        </div>
      }
    >
      <DeviceOnboardingWizard />
    </Suspense>
  );
}
