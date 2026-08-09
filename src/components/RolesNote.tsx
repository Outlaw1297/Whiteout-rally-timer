export function RolesNote({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-rally-muted text-xs">
        <strong className="text-rally-text">Admins can be rally callers too</strong> — link your
        account to a caller slot. Not every caller is an admin.
      </p>
    );
  }

  return (
    <section className="p-3 mb-4 bg-rally-accent/10 border border-rally-accent/30 rounded-lg text-sm">
      <p className="text-rally-accent text-xs font-bold mb-1">ABOUT ROLES</p>
      <p className="text-rally-muted text-xs">
        <strong className="text-rally-text">Admin</strong> accounts run rallies, manage users, and
        can also be linked as a caller to throw their own march.
      </p>
      <p className="text-rally-muted text-xs mt-1">
        <strong className="text-rally-text">Caller</strong> accounts only see their assignments and
        receive push alerts — not every caller is an admin.
      </p>
    </section>
  );
}
