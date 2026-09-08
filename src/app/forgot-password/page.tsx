"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true); // Always shown, regardless of whether the email exists.
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-navy mb-1">Reset your password</h1>
        <p className="text-slate-500 text-sm mb-6">
          Enter your registered email and we'll send you a reset link.
        </p>

        {sent ? (
          <div className="card">
            <p className="text-sm">
              If <strong>{email}</strong> is a registered administrator email, a password reset
              link has been sent. The link expires in 1 hour and can only be used once.
            </p>
            <a href="/login" className="text-blue text-sm font-medium mt-4 inline-block">
              &larr; Back to login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                required
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <a href="/login" className="text-blue text-sm font-medium block text-center">
              &larr; Back to login
            </a>
          </form>
        )}
      </div>
    </main>
  );
}
