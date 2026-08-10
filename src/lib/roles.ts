/** Shared role helpers — DEVELOPER is a superset of ADMIN for access checks. */

export type AppRole = "ADMIN" | "CALLER" | "DEVELOPER";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "DEVELOPER";
}

export function isDeveloperRole(role: string | null | undefined): boolean {
  return role === "DEVELOPER";
}

export function canBeRallyCallerRole(role: string | null | undefined): boolean {
  return role === "CALLER" || role === "ADMIN" || role === "DEVELOPER";
}

export function homePathForRole(role: string | null | undefined): string {
  if (isAdminRole(role)) return "/admin";
  if (role === "CALLER") return "/caller";
  return "/";
}

export function roleLabel(role: string): string {
  switch (role) {
    case "DEVELOPER":
      return "DEVELOPER";
    case "ADMIN":
      return "ADMIN";
    case "CALLER":
      return "CALLER";
    default:
      return role;
  }
}
