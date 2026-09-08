"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatNaira, formatDate } from "@/lib/format";
import { PaymentMethod } from "@/lib/types";

interface GuestOption {
  guest_id: string;
  guest_code: string;
  full_name: string;
  balance: number;
  ticket_fee: number;
}

export default function PaymentsClient({
  initialPayments,
  guests,
  eventId,
}: {
  initialPayments: any[];
  guests: GuestOption[];
  eventId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [payments, setPayments] = useState(initialPayments);
  const [showForm, setShowForm] = useState(false);
  const [guestId, setGuestId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedGuest = guests.find((g) => g.guest_id === guestId);

  async function handleVoid(paymentId: string) {
    const reason = prompt("Reason for voiding this payment (required):");
    if (!reason) return;
    const { error: rpcError } = await supabase.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason });
    if (rpcError) { alert(rpcError.message); return; }
    await refresh();
  }

  async function refresh() {
    const { data } = await supabase
      .from("payments")
      .select("*, guests(full_name, guest_code)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setPayments(data ?? []);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);

    if (!guestId) { setError("Select a guest."); return; }
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }

    if (!confirm && selectedGuest && amt > selectedGuest.balance && selectedGuest.balance > 0) {
      setError(`Warning: This payment is greater than the guest's outstanding balance of ${formatNaira(selectedGuest.balance)}. Submit again to confirm.`);
      setConfirm(true);
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("record_payment", {
      p_event_id: eventId,
      p_guest_id: guestId,
      p_amount: amt,
      p_method: method,
      p_paid_at: date,
      p_notes: notes || null,
    });
    setSubmitting(false);

    if (rpcError) { setError(rpcError.message); return; }

    setShowForm(false);
    setGuestId(""); setAmount(""); setNotes(""); setConfirm(false);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Payments</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm py-2 px-4">
          {showForm ? "Cancel" : "+ Record Payment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-3">
          {error && <div className="bg-orange-50 text-part text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Guest</label>
            <select className="input-field" value={guestId} onChange={(e) => { setGuestId(e.target.value); setConfirm(false); }}>
              <option value="">Select guest...</option>
              {guests.map((g) => (
                <option key={g.guest_id} value={g.guest_id}>
                  {g.guest_code} — {g.full_name} (Balance: {formatNaira(g.balance)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Amount Paid</label>
            <input type="number" min="1" step="0.01" className="input-field" value={amount}
              onChange={(e) => { setAmount(e.target.value); setConfirm(false); }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Payment Method</label>
            <select className="input-field" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
              <option value="pos">POS</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Date</label>
            <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Saving..." : confirm ? "Confirm Payment" : "Save Payment"}
          </button>
        </form>
      )}

      <div className="grid gap-2 md:hidden">
        {payments.map((p) => (
          <div key={p.id} className={`card ${p.is_voided ? "opacity-40" : ""}`}>
            <div className="flex justify-between">
              <p className="font-semibold">{formatNaira(p.amount)}</p>
              <p className="text-xs text-slate-400">{p.payment_code}</p>
            </div>
            <p className="text-sm text-slate-500">{p.guests?.full_name} ({p.guests?.guest_code})</p>
            <p className="text-xs text-slate-400">{formatDate(p.paid_at)} · {p.payment_method} · {p.receipt_number}</p>
            {!p.is_voided && (
              <button onClick={() => handleVoid(p.id)} className="text-xs text-unpaid font-medium mt-2">Void Payment</button>
            )}
          </div>
        ))}
      </div>

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Payment ID</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Guest</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Receipt</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className={`border-b border-slate-100 ${p.is_voided ? "opacity-40 line-through" : ""}`}>
                <td className="py-2 pr-4">{p.payment_code}</td>
                <td className="py-2 pr-4">{formatDate(p.paid_at)}</td>
                <td className="py-2 pr-4">{p.guests?.full_name} ({p.guests?.guest_code})</td>
                <td className="py-2 pr-4">{formatNaira(p.amount)}</td>
                <td className="py-2 pr-4 capitalize">{p.payment_method}</td>
                <td className="py-2 pr-4">{p.receipt_number}</td>
                <td className="py-2 pr-4">
                  {!p.is_voided && <button onClick={() => handleVoid(p.id)} className="text-xs text-unpaid font-medium">Void</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
