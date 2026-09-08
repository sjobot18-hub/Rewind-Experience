"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLE_DEFAULT_PERMISSIONS, Permission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";

export default function AdminsClient({
  admins,
  permsByAdmin,
  invitations,
  isOwner,
}: {
  admins: any[];
  permsByAdmin: Record<string, string[]>;
  invitations: any[];
  isOwner: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [showInvite, setShowInvite] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("finance_admin");
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>(ROLE_DEFAULT_PERMISSIONS["finance_admin"]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<string | null>(null);

  function togglePerm(p: Permission) {
    setSelectedPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setSubmitting(true);

    const res = await fetch("/api/invites/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role, permissions: selectedPerms }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok && res.status !== 207) {
      setError(data.error ?? "Failed to send invitation.");
      return;
    }
    if (res.status === 207) {
      setError("Invitation was created, but the email failed to send. Check your Resend configuration.");
    } else {
      setSuccess(`Invitation sent to ${email}.`);
    }
    setFullName(""); setEmail(""); setShowInvite(false);
    router.refresh();
  }

  async function togglePermissionForAdmin(adminId: string, perm: Permission, currentlyGranted: boolean) {
    if (currentlyGranted) {
      await supabase.from("admin_permissions").delete().eq("admin_id", adminId).eq("permission", perm);
    } else {
      await supabase.from("admin_permissions").insert({ admin_id: adminId, permission: perm });
    }
    router.refresh();
  }

  async function deactivateAdmin(adminId: string) {
    if (!confirm("Deactivate this administrator? Their access will be revoked immediately.")) return;
    await supabase
      .from("admin_profiles")
      .update({ status: "deactivated", deactivated_at: new Date().toISOString() })
      .eq("id", adminId);
    router.refresh();
  }

  async function reactivateAdmin(adminId: string) {
    await supabase.from("admin_profiles").update({ status: "active" }).eq("id", adminId);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Administrators</h1>
        {isOwner && (
          <button onClick={() => setShowInvite((s) => !s)} className="btn-primary text-sm py-2 px-4">
            {showInvite ? "Cancel" : "Invite Administrator"}
          </button>
        )}
      </div>

      {success && <div className="bg-green-50 text-paid text-sm rounded-lg px-4 py-3">{success}</div>}

      {showInvite && (
        <form onSubmit={handleInvite} className="card space-y-3">
          {error && <div className="bg-orange-50 text-part text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name</label>
            <input className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Role</label>
            <select className="input-field" value={role} onChange={(e) => {
              setRole(e.target.value);
              setSelectedPerms(ROLE_DEFAULT_PERMISSIONS[e.target.value] ?? []);
            }}>
              <option value="finance_admin">Finance Admin</option>
              <option value="event_admin">Event Admin</option>
              <option value="custom_admin">Custom Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Permissions</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedPerms.includes(p)} onChange={() => togglePerm(p)} />
                  {PERMISSION_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Sending..." : "Send Invitation"}
          </button>
        </form>
      )}

      <div className="card">
        <h2 className="font-semibold mb-3 text-sm">Administrators</h2>
        <div className="space-y-3">
          {admins.map((a) => (
            <div key={a.id} className="border-b border-slate-100 pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{a.full_name} {a.is_owner && <span className="text-gold text-xs ml-1">Owner</span>}</p>
                  <p className="text-xs text-slate-400">{a.email} · {a.role.replace("_", " ")} · {a.status}</p>
                </div>
                {isOwner && !a.is_owner && (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingAdmin(editingAdmin === a.id ? null : a.id)} className="text-xs text-blue font-medium">
                      Permissions
                    </button>
                    {a.status === "active" ? (
                      <button onClick={() => deactivateAdmin(a.id)} className="text-xs text-unpaid font-medium">Deactivate</button>
                    ) : (
                      <button onClick={() => reactivateAdmin(a.id)} className="text-xs text-paid font-medium">Reactivate</button>
                    )}
                  </div>
                )}
              </div>
              {editingAdmin === a.id && (
                <div className="grid grid-cols-2 gap-1.5 mt-2 bg-slate-50 rounded-lg p-3">
                  {ALL_PERMISSIONS.map((p) => {
                    const granted = (permsByAdmin[a.id] ?? []).includes(p);
                    return (
                      <label key={p} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={granted} onChange={() => togglePermissionForAdmin(a.id, p, granted)} />
                        {PERMISSION_LABELS[p]}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="card">
          <h2 className="font-semibold mb-3 text-sm">Pending / Past Invitations</h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex justify-between text-xs border-b border-slate-100 pb-2">
                <span>{inv.full_name} ({inv.email})</span>
                <span className="text-slate-400">{inv.status} · {formatDate(inv.created_at)}</span>
              </div>
            ))}
            {invitations.length === 0 && <p className="text-slate-400 text-xs">No invitations sent yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
