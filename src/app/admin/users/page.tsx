"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { PushSetupCard } from "@/components/PushSetupCard";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { RolesNote } from "@/components/RolesNote";
import { HomeButton } from "@/components/HomeButton";
import { StatusBanner } from "@/components/StatusBanner";
import { isAdminRole, isDeveloperRole, roleLabel, type AppRole } from "@/lib/roles";

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  activeDevices: number;
  deliveryLeadMs: number | null;
  deliverySampleCount: number;
  lastCalibratedAt: string | null;
  lastLoginAt: string | null;
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
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Admin
        </Link>
        <div className="flex items-center gap-3">
          <HomeButton />
          <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
            Logout
          </button>
        </div>
      </header>

      <h1 className="text-xl font-bold mb-2">Manage Users</h1>
      <p className="text-rally-muted text-sm mb-4">
        Create caller and admin accounts. Device counts show how many phones have enabled
        push for each account.
      </p>

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

      <section className="p-3 mb-4 bg-rally-surface border border-rally-border rounded-lg text-sm">
        <p className="text-rally-muted text-xs mb-2">SETUP FOR EACH CALLER</p>
        <ol className="list-decimal list-inside space-y-1 text-rally-muted text-xs">
          <li>Create account below (set a password or leave blank for a random one)</li>
          <li>
            Send them the install guide:{" "}
            <a href="/install" className="text-rally-accent font-bold">
              /install
            </a>{" "}
            (iPhone must use Safari → Share → Add to Home Screen)
          </li>
          <li>Caller opens the installed app and logs in at /login</li>
          <li>Caller taps Enable Rally Notifications</li>
          <li>
            Android callers must set Chrome battery to Unrestricted — send{" "}
            <a href="/fix-notifications" className="text-rally-accent font-bold">
              /fix-notifications
            </a>
          </li>
          <li>In your rally template, link that caller slot to their account</li>
        </ol>
      </section>

      {tempPassword && (
        <div className="p-3 mb-4 bg-rally-success/20 border border-rally-success rounded-lg text-sm">
          Temporary password: <span className="font-mono font-bold">{tempPassword}</span>
          <button onClick={() => setTempPassword(null)} className="ml-2 text-rally-muted">
            dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={createUser}
        className="p-4 mb-6 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-2"
      >
        <p className="text-rally-muted text-xs">CREATE ACCOUNT</p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setNewUserRole("CALLER")}
            className={`flex-1 min-w-[30%] py-2 text-sm font-bold rounded border ${
              newUserRole === "CALLER"
                ? "bg-rally-accent text-white border-rally-accent"
                : "bg-rally-bg text-rally-muted border-rally-border"
            }`}
          >
            Caller
          </button>
          <button
            type="button"
            onClick={() => setNewUserRole("ADMIN")}
            className={`flex-1 min-w-[30%] py-2 text-sm font-bold rounded border ${
              newUserRole === "ADMIN"
                ? "bg-rally-warning text-black border-rally-warning"
                : "bg-rally-bg text-rally-muted border-rally-border"
            }`}
          >
            Admin
          </button>
          {canCreateDeveloper && (
            <button
              type="button"
              onClick={() => setNewUserRole("DEVELOPER")}
              className={`flex-1 min-w-[30%] py-2 text-sm font-bold rounded border ${
                newUserRole === "DEVELOPER"
                  ? "bg-rally-success text-white border-rally-success"
                  : "bg-rally-bg text-rally-muted border-rally-border"
              }`}
            >
              Developer
            </button>
          )}
        </div>
        <input
          placeholder="Display Name (Alice)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="px-3 py-2 bg-rally-bg border border-rally-border rounded"
          required
        />
        <input
          placeholder="Username (alice)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="px-3 py-2 bg-rally-bg border border-rally-border rounded"
          required
        />
        <input
          type="password"
          placeholder="Password (optional — random if blank)"
          value={newUserPassword}
          onChange={(e) => setNewUserPassword(e.target.value)}
          autoComplete="new-password"
          className="px-3 py-2 bg-rally-bg border border-rally-border rounded"
        />
        <button
          type="submit"
          className={`py-2 font-bold rounded ${
            newUserRole === "DEVELOPER"
              ? "bg-rally-success text-white"
              : newUserRole === "ADMIN"
                ? "bg-rally-warning text-black"
                : "bg-rally-accent text-white"
          }`}
        >
          {newUserRole === "DEVELOPER"
            ? "CREATE DEVELOPER"
            : newUserRole === "ADMIN"
              ? "CREATE ADMIN"
              : "CREATE CALLER"}
        </button>
      </form>

      <section className="mb-4 space-y-2">
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Find user by name, username, role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-3 py-2 bg-rally-surface border border-rally-border rounded text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-rally-muted text-xs">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-2 py-1 bg-rally-surface border border-rally-border rounded text-xs"
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
            className="px-2 py-1 border border-rally-border rounded text-xs text-rally-muted"
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
          <span className="text-rally-muted text-xs ml-auto">
            {filteredUsers.length} / {users.length}
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {filteredUsers.map((u) => (
          <div
            key={u.id}
            className="p-3 bg-rally-surface border border-rally-border rounded-lg"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-bold">
                  {u.displayName}
                  {u.id === user.id && (
                    <span className="text-rally-accent text-xs ml-2">(you)</span>
                  )}
                </p>
                <p className="text-rally-muted text-xs">
                  @{u.username} ·{" "}
                  <span
                    className={
                      u.role === "DEVELOPER"
                        ? "text-rally-success font-bold"
                        : u.role === "ADMIN"
                          ? "text-rally-warning font-bold"
                          : "text-rally-muted"
                    }
                  >
                    {roleLabel(u.role)}
                  </span>
                  {" · "}
                  <span
                    className={u.activeDevices > 0 ? "text-rally-success" : "text-rally-warning"}
                  >
                    {u.activeDevices} device{u.activeDevices !== 1 ? "s" : ""}
                  </span>
                  {u.deliveryLeadMs != null ? (
                    <>
                      {" · "}
                      <span className="text-rally-accent font-mono">
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
                <p className="text-rally-muted text-[11px] mt-1">
                  Calibrated: {formatWhen(u.lastCalibratedAt)} · Login:{" "}
                  {formatWhen(u.lastLoginAt)}
                </p>
                {u.activeDevices === 0 && u.role === "CALLER" && (
                  <p className="text-rally-warning text-xs mt-1">
                    Needs to log in and enable push
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {u.role === "CALLER" && (
                  <button
                    onClick={() => changeRole(u.id, "ADMIN", u.displayName)}
                    className="text-xs text-rally-warning hover:text-rally-accent"
                  >
                    Make Admin
                  </button>
                )}
                {(u.role === "CALLER" || u.role === "ADMIN") && canCreateDeveloper && (
                  <button
                    onClick={() => changeRole(u.id, "DEVELOPER", u.displayName)}
                    className="text-xs text-rally-success hover:text-rally-accent"
                  >
                    Make Dev
                  </button>
                )}
                {u.role !== "CALLER" && u.id !== user.id && (
                  <button
                    onClick={() => changeRole(u.id, "CALLER", u.displayName)}
                    className="text-xs text-rally-muted hover:text-rally-accent"
                  >
                    Make Caller
                  </button>
                )}
                {u.role === "DEVELOPER" && u.id !== user.id && canCreateDeveloper && (
                  <button
                    onClick={() => changeRole(u.id, "ADMIN", u.displayName)}
                    className="text-xs text-rally-warning hover:text-rally-accent"
                  >
                    Make Admin
                  </button>
                )}
                <button
                  onClick={() => {
                    setPasswordError("");
                    setPasswordSuccess("");
                    setSetPasswordValue("");
                    setSettingPasswordFor(settingPasswordFor === u.id ? null : u.id);
                  }}
                  className="text-xs text-rally-muted hover:text-rally-accent"
                >
                  Set PW
                </button>
                <button
                  onClick={() => resetPassword(u.id, u.displayName)}
                  className="text-xs text-rally-muted hover:text-rally-accent"
                >
                  Random
                </button>
                {u.role === "CALLER" && (
                  <button
                    onClick={() => toggleActive(u.id, u.active)}
                    className={`text-xs ${u.active ? "text-rally-danger" : "text-rally-success"}`}
                  >
                    {u.active ? "Disable" : "Enable"}
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
                  className="px-3 py-2 bg-rally-bg border border-rally-border rounded text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserPassword(u.id, u.displayName)}
                    className="px-3 py-1 bg-rally-accent text-white text-xs font-bold rounded"
                  >
                    Save Password
                  </button>
                  <button
                    onClick={() => {
                      setSettingPasswordFor(null);
                      setSetPasswordValue("");
                      setPasswordError("");
                    }}
                    className="px-3 py-1 text-rally-muted text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <p className="text-rally-muted text-center text-sm py-6">No users match your search</p>
        )}
      </div>
    </main>
  );
}
