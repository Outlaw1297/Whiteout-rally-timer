/** Shared role helpers — DEVELOPER is a superset of ADMIN for access checks. */

export type AppRole = "ADMIN" | "CALLER" | "DEVELOPER";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "DEVELOPER";
}

export function homeHrefForRole(role: string | null | undefined): "/(admin)" | "/(caller)" | "/login" {
  if (isAdminRole(role)) return "/(admin)";
  if (role === "CALLER") return "/(caller)";
  return "/login";
}
