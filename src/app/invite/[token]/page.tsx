"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      const messages: Record<string, string> = {
        INVITATION_NOT_FOUND: "This invitation link is not valid.",
        INVITATION_ALREADY_USED_OR_REVOKED: "This invitation has already been used or was revoked.",
        INVITATION_EXPIRED: "This invitation has expired. Ask the Owner to send a new one.",
      };
      setError(messages[data.error] ?? data.error ?? "Something went wrong.");
      return;
    }

    router.push("/login?activated=1");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-navy mb-1">Activate your account</h1>
        <p className="text-slate-500 text-sm mb-6">
          Choose a password to complete your administrator account setup.
        </p>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input type="password" required className="input-field" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
            <input type="password" required className="input-field" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Activating..." : "Activate Account"}
          </button>
        </form>
      </div>
    </main>
  );
}
