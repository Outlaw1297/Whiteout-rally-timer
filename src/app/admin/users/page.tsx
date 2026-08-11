"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  KeyRound,
  Shield,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PushSetupCard } from "@/components/PushSetupCard";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { RolesNote } from "@/components/RolesNote";
import { AdminNav } from "@/components/AdminNav";
import { StatusBanner } from "@/components/StatusBanner";
import { AppShell, Panel, SectionLabel } from "@/components/ui/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isAdminRole, isDeveloperRole, roleLabel, type AppRole } from "@/lib/roles";

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  activeDevices: number;
  online?: boolean;
  deliveryLeadMs: number | null;
  deliverySampleCount: number;
  lastCalibratedAt: string | null;
  lastLoginAt: string | null;
  lastSeenAt?: string | null;
}

type SortKey = "displayName" | "username" | "role" | "devices" | "calibrated" | "login";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleBadgeTone(role: string): "success" | "warning" | "neutral" {
  if (role === "DEVELOPER") return "success";
  if (role === "ADMIN") return "warning";
  return "neutral";
}

export default function AdminUsersPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("CALLER");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("displayName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []));
  };

  const deleteUser = async (id: string, name: string) => {
    if (
      !confirm(
        `Permanently delete ${name}? Their devices and rally links will be removed. This cannot be undone.`
      )
    ) {
      return;
    }
    setErrorMsg("");
    setStatusMsg("");
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorMsg(data.error || "Failed to delete user");
      return;
    }
    setStatusMsg(data.message || `Deleted ${name}`);
    loadUsers();
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && !isAdminRole(user.role)) router.push("/caller");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && isAdminRole(user.role)) {
      loadUsers();
      const interval = setInterval(loadUsers, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users;
    if (q) {
      list = list.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "username":
          cmp = a.username.localeCompare(b.username);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "devices":
          cmp = a.activeDevices - b.activeDevices;
          break;
        case "calibrated":
          cmp =
            (a.lastCalibratedAt ? new Date(a.lastCalibratedAt).getTime() : 0) -
            (b.lastCalibratedAt ? new Date(b.lastCalibratedAt).getTime() : 0);
          break;
        case "login":
          cmp =
            (a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0) -
            (b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0);
          break;
        default:
          cmp = a.displayName.localeCompare(b.displayName);
      }
      return cmp * dir;
    });
  }, [users, query, sortKey, sortDir]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    if (newUserRole === "DEVELOPER" && !isDeveloperRole(user?.role)) {
      setCreateError("Only developers can create developer accounts");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        displayName,
        role: newUserRole,
        ...(newUserPassword ? { password: newUserPassword } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateError(data.error || "Failed to create user");
      return;
    }
    setTempPassword(data.temporaryPassword || null);
    setCreateSuccess(
      data.temporaryPassword
        ? `Account created for ${displayName}. Temporary password shown below.`
        : `Account created for ${displayName}.`
    );
    setUsername("");
    setDisplayName("");
    setNewUserPassword("");
    setNewUserRole("CALLER");
    loadUsers();
  };

  const changeRole = async (id: string, role: AppRole, name: string) => {
    if (role === "DEVELOPER" && !isDeveloperRole(user?.role)) {
      setErrorMsg("Only developers can grant the developer role");
      return;
    }
    const action =
      role === "DEVELOPER"
        ? "grant developer access to"
        : role === "ADMIN"
          ? "grant admin access to"
          : "set as caller for";
    if (
      !confirm(
        `${action} ${name}? They must log out and back in for the change to take effect.`
      )
    ) {
      return;
    }

    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Failed to update role");
      setStatusMsg("");
      return;
    }
    setStatusMsg(`Updated ${name} to ${roleLabel(role)}`);
    setErrorMsg("");
    loadUsers();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error || "Failed to update account");
      return;
    }
    setStatusMsg(active ? "Account disabled" : "Account enabled");
    loadUsers();
  };

  const resetPassword = async (id: string, name: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPasswordError(data.error || "Failed to reset password");
      return;
    }
    if (data.temporaryPassword) {
      setTempPassword(data.temporaryPassword);
      setSettingPasswordFor(null);
      setSetPasswordValue("");
      setPasswordSuccess(`Random password generated for ${name}`);
      setPasswordError("");
    }
  };

  const setUserPassword = async (id: string, name: string) => {
    setPasswordError("");
    setPasswordSuccess("");
    if (setPasswordValue.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: setPasswordValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPasswordError(data.error || "Failed to set password");
      return;
    }

    setSettingPasswordFor(null);
    setSetPasswordValue("");
    setPasswordError("");
    setPasswordSuccess(`Password updated for ${name}`);
  };

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  const canCreateDeveloper = isDeveloperRole(user.role);

  return (
    <AppShell wide className="page-enter">
      <AdminNav displayName={user.displayName} role={user.role} onLogout={logout} />

      <h1 className="text-xl font-bold text-rally-snow mb-2">Manage Users</h1>
      <p className="text-rally-muted text-sm mb-4">
        Create caller and admin accounts. Device counts show how many phones have enabled
        push for each account.
      </p>

      {canCreateDeveloper ? (
        <Panel accent className="mb-3 text-xs">
          <p className="text-rally-ice">
            You are a <strong>Developer</strong>. Use <strong>Make Dev</strong> on any caller/admin
            below, or pick Developer when creating an account.
          </p>
        </Panel>
      ) : (
        <Panel className="mb-3 border-rally-warning/40 bg-rally-warning/10 text-xs">
          <p className="text-rally-warning">
            Only Developer accounts can grant the Developer role. Ask an existing developer to
            promote you, then log out and back in.
          </p>
        </Panel>
      )}

      <RolesNote />

      <PushSetupCard onSubscribed={loadUsers} />

      <ChangePasswordForm />

      <StatusBanner
        success={statusMsg || passwordSuccess || createSuccess || undefined}
        error={errorMsg || createError || passwordError || undefined}
        onDismiss={() => {
          setStatusMsg("");
          setErrorMsg("");
          setPasswordSuccess("");
          setPasswordError("");
          setCreateSuccess("");
          setCreateError("");
        }}
      />

      <Panel className="mb-4 text-sm">
        <SectionLabel>Setup for Each Caller</SectionLabel>
        <ol className="list-decimal list-inside space-y-1 text-rally-muted text-xs mt-2">
          <li>Create account below (set a password or leave blank for a random one)</li>
          <li>
            Send them the install guide:{" "}
            <Link href="/install" className="text-rally-ice font-semibold">
              /install
            </Link>{" "}
            (iPhone must use Safari → Share → Add to Home Screen)
          </li>
          <li>Caller opens the installed app and logs in at /login</li>
          <li>
            First login walks them through{" "}
            <Link href="/onboarding" className="text-rally-ice font-semibold">
              /onboarding
            </Link>{" "}
            (install, allow alerts, pop-up, battery) with screenshots
          </li>
          <li>Caller taps Enable Rally Notifications if they skipped setup</li>
          <li>
            Android callers must set Chrome battery to Unrestricted — send{" "}
            <Link href="/fix-notifications" className="text-rally-ice font-semibold">
              /fix-notifications
            </Link>
          </li>
          <li>In your rally template, link that caller slot to their account</li>
        </ol>
        <p className="mt-3 text-xs text-rally-muted">
          Replay this device&apos;s setup walkthrough:{" "}
          <Link href="/onboarding?next=/admin/users" className="text-rally-ice font-semibold">
            Open device setup →
          </Link>
        </p>
      </Panel>

      {tempPassword && (
        <Panel accent className="mb-4 text-sm">
          <p>
            Temporary password:{" "}
            <span className="font-mono font-bold text-rally-snow">{tempPassword}</span>
          </p>
          <button onClick={() => setTempPassword(null)} className="btn-ghost text-xs mt-1">
            Dismiss
          </button>
        </Panel>
      )}

      <form onSubmit={createUser} className="mb-6">
        <Panel className="flex flex-col gap-3">
          <SectionLabel>Create Account</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setNewUserRole("CALLER")}
              className={`flex-1 min-w-[30%] btn-secondary !min-h-[40px] !py-2 text-sm ${
                newUserRole === "CALLER" ? "!border-rally-ice/50 !bg-rally-ice/10 !text-rally-ice" : ""
              }`}
            >
              <User className="h-4 w-4" aria-hidden />
              Caller
            </button>
            <button
              type="button"
              onClick={() => setNewUserRole("ADMIN")}
              className={`flex-1 min-w-[30%] btn-secondary !min-h-[40px] !py-2 text-sm ${
                newUserRole === "ADMIN"
                  ? "!border-rally-warning/50 !bg-rally-warning/10 !text-rally-warning"
                  : ""
              }`}
            >
              <Shield className="h-4 w-4" aria-hidden />
              Admin
            </button>
            {canCreateDeveloper && (
              <button
                type="button"
                onClick={() => setNewUserRole("DEVELOPER")}
                className={`flex-1 min-w-[30%] btn-secondary !min-h-[40px] !py-2 text-sm ${
                  newUserRole === "DEVELOPER"
                    ? "!border-rally-success/50 !bg-rally-success/10 !text-rally-success"
                    : ""
                }`}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Developer
              </button>
            )}
          </div>
          <input
            placeholder="Display Name (Alice)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input-field"
            required
          />
          <input
            placeholder="Username (alice)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field"
            required
          />
          <input
            type="password"
            placeholder="Password (optional — random if blank)"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            autoComplete="new-password"
            className="input-field"
          />
          <button
            type="submit"
            className={
              newUserRole === "DEVELOPER"
                ? "btn-success"
                : newUserRole === "ADMIN"
                  ? "btn-secondary !border-rally-warning/50 !text-rally-warning"
                  : "btn-primary"
            }
          >
            {newUserRole === "DEVELOPER"
              ? "Create Developer"
              : newUserRole === "ADMIN"
                ? "Create Admin"
                : "Create Caller"}
          </button>
        </Panel>
      </form>

      <section className="mb-4 space-y-2">
        <input
          type="search"
          placeholder="Find user by name, username, role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field text-sm"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <label className="label-field">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="input-field !w-auto !min-h-[36px] !py-1.5 text-xs"
          >
            <option value="displayName">Name</option>
            <option value="username">Username</option>
            <option value="role">Role</option>
            <option value="devices">Devices</option>
            <option value="calibrated">Last calibrated</option>
            <option value="login">Last login</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="btn-secondary !min-h-[36px] !py-1.5 text-xs gap-1"
          >
            {sortDir === "asc" ? (
              <>
                <ArrowUp className="h-3 w-3" aria-hidden />
                Asc
              </>
            ) : (
              <>
                <ArrowDown className="h-3 w-3" aria-hidden />
                Desc
              </>
            )}
          </button>
          <span className="text-rally-muted text-xs ml-auto">
            {filteredUsers.length} / {users.length}
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {filteredUsers.map((u) => (
          <Panel key={u.id} className="!p-3">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-rally-snow">{u.displayName}</p>
                  {u.id === user.id && (
                    <StatusBadge tone="info">you</StatusBadge>
                  )}
                  <StatusBadge tone={roleBadgeTone(u.role)}>{roleLabel(u.role)}</StatusBadge>
                </div>
                <p className="text-rally-muted text-xs mt-1">
                  @{u.username}
                  {" · "}
                  <span
                    className={u.activeDevices > 0 ? "text-rally-success" : "text-rally-warning"}
                  >
                    {u.activeDevices} device{u.activeDevices !== 1 ? "s" : ""}
                  </span>
                  {u.deliveryLeadMs != null ? (
                    <>
                      {" · "}
                      <span className="text-rally-ice font-mono">
                        {u.deliveryLeadMs}ms lead
                      </span>
                      <span className="text-rally-muted">
                        {" "}
                        ({u.deliverySampleCount} samples)
                      </span>
                    </>
                  ) : u.activeDevices > 0 ? (
                    <>
                      {" · "}
                      <span className="text-rally-warning">not calibrated</span>
                    </>
                  ) : null}
                </p>
                <p className="text-rally-muted text-[11px] mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={u.online ? "live" : "neutral"} pulse={!!u.online}>
                    {u.online ? "Online" : "Offline"}
                  </StatusBadge>
                  <span>
                    Seen {formatWhen(u.lastSeenAt)} · Login {formatWhen(u.lastLoginAt)}
                  </span>
                </p>
                <p className="text-rally-muted text-[11px] mt-0.5">
                  Calibrated: {formatWhen(u.lastCalibratedAt)}
                </p>
                {u.activeDevices === 0 && u.role === "CALLER" && (
                  <p className="text-rally-warning text-xs mt-1">
                    Needs to log in and enable push
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {u.role !== "ADMIN" && u.role !== "DEVELOPER" && (
                  <button
                    onClick={() => changeRole(u.id, "ADMIN", u.displayName)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-warning"
                  >
                    Make Admin
                  </button>
                )}
                {canCreateDeveloper && u.role !== "DEVELOPER" && (
                  <button
                    onClick={() => changeRole(u.id, "DEVELOPER", u.displayName)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-success font-semibold"
                  >
                    Make Dev
                  </button>
                )}
                {u.role !== "CALLER" && u.id !== user.id && (
                  <button
                    onClick={() => changeRole(u.id, "CALLER", u.displayName)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs"
                  >
                    Make Caller
                  </button>
                )}
                {u.role === "DEVELOPER" && u.id !== user.id && canCreateDeveloper && (
                  <button
                    onClick={() => changeRole(u.id, "ADMIN", u.displayName)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-warning"
                  >
                    Demote to Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    setPasswordError("");
                    setPasswordSuccess("");
                    setSetPasswordValue("");
                    setSettingPasswordFor(settingPasswordFor === u.id ? null : u.id);
                  }}
                  className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs gap-1"
                >
                  <KeyRound className="h-3 w-3" aria-hidden />
                  Set PW
                </button>
                <button
                  onClick={() => resetPassword(u.id, u.displayName)}
                  className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs"
                >
                  Random
                </button>
                {u.role === "CALLER" && (
                  <button
                    onClick={() => toggleActive(u.id, u.active)}
                    className={`btn-ghost !min-h-[32px] !py-1 !px-2 text-xs ${
                      u.active ? "text-rally-danger" : "text-rally-success"
                    }`}
                  >
                    {u.active ? "Disable" : "Enable"}
                  </button>
                )}
                {u.id !== user.id && (
                  <button
                    onClick={() => deleteUser(u.id, u.displayName)}
                    className="btn-ghost !min-h-[32px] !py-1 !px-2 text-xs text-rally-danger gap-1"
                    title="Delete user"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {settingPasswordFor === u.id && (
              <div className="mt-3 pt-3 border-t border-rally-border flex flex-col gap-2">
                <input
                  type="password"
                  placeholder="New password (8+ characters)"
                  value={setPasswordValue}
                  onChange={(e) => setSetPasswordValue(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  className="input-field text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserPassword(u.id, u.displayName)}
                    className="btn-primary !min-h-[36px] !py-1.5 text-xs flex-1"
                  >
                    Save Password
                  </button>
                  <button
                    onClick={() => {
                      setSettingPasswordFor(null);
                      setSetPasswordValue("");
                      setPasswordError("");
                    }}
                    className="btn-ghost !min-h-[36px] !py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Panel>
        ))}
        {filteredUsers.length === 0 && (
          <p className="text-rally-muted text-center text-sm py-6">No users match your search</p>
        )}
      </div>
    </AppShell>
  );
}
