"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

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
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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
    if (user?.role === "ADMIN") loadUsers();
  }, [user]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, displayName, role: "CALLER" }),
    });
    const data = await res.json();
    if (res.ok) {
      setTempPassword(data.temporaryPassword || null);
      setUsername("");
      setDisplayName("");
      loadUsers();
    }
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
    }
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

      <h1 className="text-xl font-bold mb-4">Manage Callers</h1>

      {tempPassword && (
        <div className="p-3 mb-4 bg-rally-success/20 border border-rally-success rounded-lg text-sm">
          Temporary password: <span className="font-mono font-bold">{tempPassword}</span>
          <button onClick={() => setTempPassword(null)} className="ml-2 text-rally-muted">
            dismiss
          </button>
        </div>
      )}

      <form onSubmit={createUser} className="p-4 mb-6 bg-rally-surface border border-rally-border rounded-lg flex flex-col gap-2">
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
        <button type="submit" className="py-2 bg-rally-accent text-white font-bold rounded">
          CREATE CALLER
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <div
            key={u.id}
            className="p-3 bg-rally-surface border border-rally-border rounded-lg flex justify-between items-center"
          >
            <div>
              <p className="font-bold">{u.displayName}</p>
              <p className="text-rally-muted text-xs">
                @{u.username} · {u.activeDevices} device{u.activeDevices !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => resetPassword(u.id)}
                className="text-xs text-rally-muted hover:text-rally-accent"
              >
                Reset PW
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
        ))}
      </div>
    </main>
  );
}
