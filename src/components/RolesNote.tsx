import { Panel, SectionLabel } from "@/components/ui/AppShell";

export function RolesNote({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-rally-muted text-xs mb-4">
        <strong className="text-rally-snow">Admins and developers can be rally callers too</strong>{" "}
        — link your account to a caller slot. Not every caller is an admin.
      </p>
    );
  }

  return (
    <Panel accent className="mb-4 text-sm">
      <SectionLabel>About Roles</SectionLabel>
      <p className="text-rally-muted text-xs mt-2">
        <strong className="text-rally-snow">Developer</strong> accounts can do everything admins
        can, plus access diagnostics. Only developers can grant the developer role. The first
        account is automatically a developer.
      </p>
      <p className="text-rally-muted text-xs mt-1">
        <strong className="text-rally-snow">Admin</strong> accounts run rallies, manage users, and
        can also be linked as a caller to throw their own march.
      </p>
      <p className="text-rally-muted text-xs mt-1">
        <strong className="text-rally-snow">Caller</strong> accounts only see their assignments and
        receive push alerts — not every caller is an admin.
      </p>
    </Panel>
  );
}
