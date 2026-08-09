import type { MarchDuplicateGroup } from "@/lib/march-groups";
import { formatJointLaunchNames } from "@/lib/march-groups";

export function MarchDuplicateNotice({ groups }: { groups: MarchDuplicateGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section className="p-4 mb-4 bg-rally-warning/10 border border-rally-warning/40 rounded-lg">
      <p className="text-rally-warning text-xs font-bold mb-2">SAME MARCH TIME</p>
      <div className="flex flex-col gap-2 text-sm">
        {groups.map((group) => (
          <p key={group.marchDurationSeconds}>
            <span className="font-mono text-rally-accent">March {group.marchFormatted}</span>
            {" — "}
            <span className="font-bold">{formatJointLaunchNames(group.displayNames)}</span>
            <span className="text-rally-muted"> launch together</span>
          </p>
        ))}
      </div>
    </section>
  );
}
