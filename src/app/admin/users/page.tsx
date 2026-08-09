"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { PushSetupCard } from "@/components/PushSetupCard";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  activeDevices: number;
}

export default function AdminUsersPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"CALLER" | "ADMIN">("CALLER");
  const [createError, setCreateError] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []));
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && user.role !== "ADMIN") router.push("/caller");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadUsers();
      const interval = setInterval(loadUsers, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
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
    setUsername("");
    setDisplayName("");
    setNewUserPassword("");
    setNewUserRole("CALLER");
    loadUsers();
  };

  const changeRole = async (id: string, role: "ADMIN" | "CALLER", displayName: string) => {
    const action = role === "ADMIN" ? "grant admin access to" : "remove admin access from";
    if (!confirm(`${action} ${displayName}? They must log out and back in for the change to take effect.`)) {
      return;
    }

    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to update role");
      return;
    }
    loadUsers();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    loadUsers();
  };

  const resetPassword = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: true }),
    });
    const data = await res.json();
    if (data.temporaryPassword) {
      setTempPassword(data.temporaryPassword);
      setSettingPasswordFor(null);
      setSetPasswordValue("");
    }
  };

  const setUserPassword = async (id: string) => {
    setPasswordError("");
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
  };

  if (loading || !user) {
    return <div className="p-8 text-center text-rally-muted">Loading...</div>;
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link href="/admin" className="text-rally-muted text-sm hover:text-rally-accent">
          ← Admin
        </Link>
        <button onClick={logout} className="text-rally-muted text-sm hover:text-rally-danger">
          Logout
        </button>
      </header>

      <h1 className="text-xl font-bold mb-2">Manage Users</h1>
      <p className="text-rally-muted text-sm mb-4">
        Create caller and admin accounts. Device counts show how many phones have enabled
        push for each account.
      </p>

      <PushSetupCard onSubscribed={loadUsers} />

      <ChangePasswordForm />

      <section className="p-3 mb-4 bg-rally-surface border border-rally-border rounded-lg text-sm">
        <p className="text-rally-muted text-xs mb-2">SETUP FOR EACH CALLER</p>
        <ol className="list-decimal list-inside space-y-1 text-rally-muted text-xs">
          <li>Create account below (set a password or leave blank for a random one)</li>
          <li>Caller opens the app and logs in at /login</li>
          <li>Caller taps Enable Rally Notifications on their dashboard</li>
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

      <form onSubmit={createUser} className="p-4 mb-6 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-2">
        <p className="text-rally-muted text-xs">CREATE ACCOUNT</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewUserRole("CALLER")}
            className={`flex-1 py-2 text-sm font-bold rounded border ${
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
            className={`flex-1 py-2 text-sm font-bold rounded border ${
              newUserRole === "ADMIN"
                ? "bg-rally-warning text-black border-rally-warning"
                : "bg-rally-bg text-rally-muted border-rally-border"
            }`}
          >
            Admin
          </button>
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
          className={`py-2 text-white font-bold rounded ${
            newUserRole === "ADMIN" ? "bg-rally-warning text-black" : "bg-rally-accent"
          }`}
        >
          {newUserRole === "ADMIN" ? "CREATE ADMIN" : "CREATE CALLER"}
        </button>
        {createError && <p className="text-rally-danger text-xs">{createError}</p>}
      </form>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div
            key={u.id}
            className="p-3 bg-rally-surface border border-rally-border rounded-lg"
          >
            <div className="flex justify-between items-center">
              <div>
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
                      u.role === "ADMIN" ? "text-rally-warning font-bold" : "text-rally-muted"
                    }
                  >
                    {u.role === "ADMIN" ? "ADMIN" : "CALLER"}
                  </span>
                  {" · "}
                  <span className={u.activeDevices > 0 ? "text-rally-success" : "text-rally-warning"}>
                    {u.activeDevices} device{u.activeDevices !== 1 ? "s" : ""}
                  </span>
                </p>
                {u.activeDevices === 0 && u.role === "CALLER" && (
                  <p className="text-rally-warning text-xs mt-1">Needs to log in and enable push</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {u.role === "CALLER" ? (
                  <button
                    onClick={() => changeRole(u.id, "ADMIN", u.displayName)}
                    className="text-xs text-rally-warning hover:text-rally-accent"
                  >
                    Make Admin
                  </button>
                ) : (
                  u.id !== user.id && (
                    <button
                      onClick={() => changeRole(u.id, "CALLER", u.displayName)}
                      className="text-xs text-rally-muted hover:text-rally-accent"
                    >
                      Make Caller
                    </button>
                  )
                )}
                <button
                  onClick={() => {
                    setPasswordError("");
                    setSetPasswordValue("");
                    setSettingPasswordFor(settingPasswordFor === u.id ? null : u.id);
                  }}
                  className="text-xs text-rally-muted hover:text-rally-accent"
                >
                  Set PW
                </button>
                <button
                  onClick={() => resetPassword(u.id)}
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
                {passwordError && <p className="text-rally-danger text-xs">{passwordError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserPassword(u.id)}
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
      </div>
    </main>
  );
}
