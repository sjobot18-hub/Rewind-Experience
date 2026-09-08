"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatNaira, formatDate } from "@/lib/format";
import { EXPENSE_CATEGORIES, PaymentMethod } from "@/lib/types";

export default function ExpensesClient({
  initialExpenses,
  eventId,
  availableBalance,
}: {
  initialExpenses: any[];
  eventId: string;
  availableBalance: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleVoid(expenseId: string) {
    const reason = prompt("Reason for voiding this expense (required):");
    if (!reason) return;
    const { error: rpcError } = await supabase.rpc("void_expense", { p_expense_id: expenseId, p_reason: reason });
    if (rpcError) { alert(rpcError.message); return; }
    await refresh();
  }

  async function refresh() {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setExpenses(data ?? []);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);

    if (!description.trim()) { setError("Description is required."); return; }
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }

    if (!confirm && amt > availableBalance) {
      setError(`This expense (${formatNaira(amt)}) exceeds the current available balance of ${formatNaira(availableBalance)}. Submit again to confirm.`);
      setConfirm(true);
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("record_expense", {
      p_event_id: eventId,
      p_category: category,
      p_description: description.trim(),
      p_vendor: vendor.trim() || null,
      p_amount: amt,
      p_method: method,
      p_spent_at: date,
      p_notes: notes || null,
    });
    setSubmitting(false);

    if (rpcError) { setError(rpcError.message); return; }

    setShowForm(false);
    setDescription(""); setVendor(""); setAmount(""); setNotes(""); setConfirm(false);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Expenses</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm py-2 px-4">
          {showForm ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      <div className="card">
        <p className="text-xs text-slate-500">Available Balance</p>
        <p className="text-lg font-bold text-navy">{formatNaira(availableBalance)}</p>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-3">
          {error && <div className="bg-orange-50 text-part text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Category</label>
            <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Vendor (optional)</label>
            <input className="input-field" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Amount</label>
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
            {submitting ? "Saving..." : confirm ? "Confirm Expense" : "Save Expense"}
          </button>
        </form>
      )}

      <div className="grid gap-2 md:hidden">
        {expenses.map((e) => (
          <div key={e.id} className={`card ${e.is_voided ? "opacity-40" : ""}`}>
            <div className="flex justify-between">
              <p className="font-semibold">{formatNaira(e.amount)}</p>
              <p className="text-xs text-slate-400">{e.expense_code}</p>
            </div>
            <p className="text-sm text-slate-500">{e.description} · {e.category}</p>
            <p className="text-xs text-slate-400">{formatDate(e.spent_at)} · Balance after: {formatNaira(e.balance_after)}</p>
            {!e.is_voided && (
              <button onClick={() => handleVoid(e.id)} className="text-xs text-unpaid font-medium mt-2">Void Expense</button>
            )}
          </div>
        ))}
      </div>

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Expense ID</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Balance After</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className={`border-b border-slate-100 ${e.is_voided ? "opacity-40 line-through" : ""}`}>
                <td className="py-2 pr-4">{e.expense_code}</td>
                <td className="py-2 pr-4">{formatDate(e.spent_at)}</td>
                <td className="py-2 pr-4">{e.category}</td>
                <td className="py-2 pr-4">{e.description}</td>
                <td className="py-2 pr-4">{formatNaira(e.amount)}</td>
                <td className="py-2 pr-4">{formatNaira(e.balance_after)}</td>
                <td className="py-2 pr-4">
                  {!e.is_voided && <button onClick={() => handleVoid(e.id)} className="text-xs text-unpaid font-medium">Void</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
