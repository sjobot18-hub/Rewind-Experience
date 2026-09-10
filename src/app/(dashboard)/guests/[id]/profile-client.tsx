"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatNaira, formatDate } from "@/lib/format";
import { GuestFinancials, Payment, PaymentMethod } from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  const cls = status === "paid" ? "badge-paid" : status === "part_payment" ? "badge-part" : "badge-unpaid";
  const label = status === "paid" ? "Paid" : status === "part_payment" ? "Part Payment" : "Unpaid";
  return <span className={cls}>{label}</span>;
}

export default function GuestProfileClient({
  guest,
  payments,
  eventName,
  presentedBy,
}: {
  guest: GuestFinancials;
  payments: Payment[];
  eventName: string;
  presentedBy: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOverpay, setConfirmOverpay] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);

  function looksLikeDuplicate(amt: number) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return payments.some(
      (p) =>
        !p.is_voided &&
        p.amount === amt &&
        p.payment_method === method &&
        new Date(p.created_at).getTime() > fiveMinAgo
    );
  }

  async function submitPayment(amt: number) {
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("record_payment", {
      p_event_id: guest.event_id,
      p_guest_id: guest.guest_id,
      p_amount: amt,
      p_method: method,
      p_paid_at: date,
      p_notes: notes || null,
    });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setReceipt(data as Payment);
    setShowForm(false);
    setAmount("");
    setNotes("");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);

    if (!amt || amt <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    if (!confirmOverpay && amt > guest.balance && guest.balance > 0) {
      setError(`Warning: This payment (${formatNaira(amt)}) is greater than the guest's outstanding balance (${formatNaira(guest.balance)}). Submit again to confirm.`);
      setConfirmOverpay(true);
      return;
    }

    if (!duplicateWarning && looksLikeDuplicate(amt)) {
      setError("Possible duplicate payment detected: same amount and method within the last 5 minutes. Submit again to confirm this is not a duplicate.");
      setDuplicateWarning(true);
      return;
    }

    await submitPayment(amt);
    setConfirmOverpay(false);
    setDuplicateWarning(false);
  }

  const whatsappUrl = guest.balance > 0
    ? `https://wa.me/${guest.phone_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
        `Hi ${guest.full_name}, this is a reminder about your outstanding balance of ${formatNaira(guest.balance)} for ${eventName}. Kindly complete your payment at your earliest convenience. Thank you!`
      )}`
    : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold text-navy">{guest.full_name}</h1>
            <p className="text-xs text-slate-400">{guest.guest_code} · {guest.phone_number} · {guest.gender}</p>
          </div>
          <StatusBadge status={guest.status} />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
          <div><p className="text-slate-400 text-xs">Ticket Fee</p><p className="font-semibold">{formatNaira(guest.ticket_fee)}</p></div>
          <div><p className="text-slate-400 text-xs">Total Paid</p><p className="font-semibold">{formatNaira(guest.total_paid)}</p></div>
          <div><p className="text-slate-400 text-xs">Balance</p><p className="font-semibold">{formatNaira(guest.balance)}</p></div>
        </div>
        {guest.is_overpaid && (
          <p className="text-xs text-part mt-2">Overpaid by {formatNaira(guest.overpayment_amount)}</p>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary flex-1 text-sm py-2.5">
            {showForm ? "Cancel" : "Record Payment"}
          </button>
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn-secondary flex-1 text-center text-sm py-2.5">
              WhatsApp Reminder
            </a>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-3">
          {error && <div className="bg-orange-50 text-part text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Amount Paid</label>
            <input type="number" min="1" step="0.01" className="input-field" value={amount}
              onChange={(e) => { setAmount(e.target.value); setConfirmOverpay(false); setDuplicateWarning(false); setError(null); }} />
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
            {submitting ? "Saving..." : (confirmOverpay || duplicateWarning) ? "Confirm Payment" : "Save Payment"}
          </button>
        </form>
      )}

      {receipt && (
        <section className="card receipt-print-wrap border border-slate-200 shadow-sm rounded-xl" id="receipt">
          <div className="text-center border-b border-slate-200 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.20em] text-gold">BEACH/APARTMENT HANGOUT</p>
            <h2 className="text-2xl font-black text-navy mt-2">The Rewind Experience</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mt-2">Official payment receipt</p>
          </div>

          <div className="px-1 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-sm">
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Receipt number</span>
                <span className="font-semibold text-right text-navy">{receipt.receipt_number}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Payment ID</span>
                <span className="font-semibold text-right text-navy">{receipt.public_payment_id ?? receipt.payment_code}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Date</span>
                <span className="font-semibold text-right text-navy">{formatDate(receipt.paid_at)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Guest name</span>
                <span className="font-semibold text-right text-navy">{guest.full_name}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Guest ID</span>
                <span className="font-semibold text-right text-navy">{guest.guest_code}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Amount paid</span>
                <span className="font-semibold text-right text-navy">{formatNaira(receipt.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Payment method</span>
                <span className="font-semibold text-right capitalize text-navy">{receipt.payment_method}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Received by</span>
                <span className="font-semibold text-right text-navy">{receipt.received_by || "Rewind Experience"}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Ticket fee</span>
                <span className="font-semibold text-right text-navy">{formatNaira(guest.ticket_fee)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Total paid to date</span>
                <span className="font-semibold text-right text-navy">{formatNaira(guest.total_paid + receipt.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Remaining balance</span>
                <span className="font-semibold text-right text-navy">{formatNaira(Math.max(guest.ticket_fee - guest.total_paid - receipt.amount, 0))}</span>
              </div>
              <div className="flex justify-between border-b border-dashed border-slate-200 py-2">
                <span className="text-slate-500">Status</span>
                <span className="text-right">
                  <span className={receipt.is_voided ? "badge-unpaid" : "badge-paid"}>{receipt.is_voided ? "Voided" : "Paid"}</span>
                </span>
              </div>
            </div>

            {receipt.is_overpayment && (
              <div className="mt-4 rounded-lg bg-orange-50 text-part px-3 py-2 text-xs font-medium">
                This payment includes an overpayment.
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button onClick={() => window.print()} className="btn-secondary text-sm px-4 py-2.5">Print Receipt</button>
            </div>
          </div>
        </section>
      )}

      <div className="card">
        <h2 className="font-semibold mb-3">Payment History</h2>
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className={`flex justify-between text-sm border-b border-slate-100 pb-2 ${p.is_voided ? "opacity-40 line-through" : ""}`}>
              <div>
                <p className="font-medium">{formatNaira(p.amount)} <span className="text-slate-400 font-normal">· {p.payment_method}</span></p>
                <p className="text-xs text-slate-400">{formatDate(p.paid_at)} · {p.receipt_number}</p>
              </div>
              {p.is_overpayment && <span className="text-xs text-part self-center">Overpayment</span>}
            </div>
          ))}
          {payments.length === 0 && <p className="text-slate-400 text-sm">No payments recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}
