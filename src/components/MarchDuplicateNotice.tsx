import { AlertTriangle } from "lucide-react";
import type { MarchDuplicateGroup } from "@/lib/march-groups";
import { formatJointLaunchNames } from "@/lib/march-groups";
import { Panel, SectionLabel } from "@/components/ui/AppShell";

export function MarchDuplicateNotice({ groups }: { groups: MarchDuplicateGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <Panel className="mb-4 border-rally-warning/40 bg-rally-warning/10">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-rally-warning shrink-0" aria-hidden />
        <SectionLabel>Same March Time</SectionLabel>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {groups.map((group) => (
          <p key={group.marchDurationSeconds}>
            <span className="font-mono text-rally-ice">March {group.marchFormatted}</span>
            {" — "}
            <span className="font-semibold text-rally-snow">{formatJointLaunchNames(group.displayNames)}</span>
            <span className="text-rally-muted"> launch together</span>
          </p>
        ))}
      </div>
    </Panel>
  );
}
