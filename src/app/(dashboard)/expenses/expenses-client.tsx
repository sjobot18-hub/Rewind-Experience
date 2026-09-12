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

  const [editOpen, setEditOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [editCategory, setEditCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [editDescription, setEditDescription] = useState("");
  const [editVendor, setEditVendor] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState<PaymentMethod>("cash");
  const [editDate, setEditDate] = useState(new Date().toISOString().slice(0, 10));
  const [editNotes, setEditNotes] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

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

  function openEdit(expense: any) {
    setEditingExpense(expense);
    setEditCategory(expense.category);
    setEditDescription(expense.description);
    setEditVendor(expense.vendor ?? "");
    setEditAmount(String(expense.amount));
    setEditMethod(expense.payment_method);
    setEditDate(expense.spent_at);
    setEditNotes(expense.notes ?? "");
    setEditError(null);
    setEditSuccess(null);
    setEditOpen(true);
  }

  async function handleEditExpense(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);

    if (!editDescription.trim()) {
      setEditError("Description is required.");
      return;
    }
    const amt = parseFloat(editAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      setEditError("Enter a valid amount.");
      return;
    }

    if (!editingExpense) return;

    setEditSubmitting(true);
    try {
      const res = await fetch("/api/expenses/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: editingExpense.id,
          event_id: eventId,
          category: editCategory,
          description: editDescription.trim(),
          vendor: editVendor.trim() || null,
          amount: amt,
          payment_method: editMethod,
          spent_at: editDate,
          notes: editNotes || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setEditError(data.message ?? "Failed to update expense.");
        return;
      }
      setEditSuccess("Expense updated successfully.");
      await refresh();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to update expense.");
    }
    setEditSubmitting(false);
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
            <div className="flex gap-2 mt-2">
              {!e.is_voided && (
                <button onClick={() => openEdit(e)} className="btn-secondary text-xs py-1.5 px-3">Edit</button>
              )}
            </div>
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
                  {!e.is_voided && <button onClick={() => openEdit(e)} className="text-xs text-blue font-medium ml-2">Edit</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editOpen && editingExpense && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-50 p-3">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-black text-slate-800">Edit Expense</div>
                <div className="text-xs text-slate-500">{editingExpense.expense_code}</div>
              </div>
              <button onClick={() => setEditOpen(false)} className="btn-secondary text-xs py-1.5 px-3">Close</button>
            </div>
            <form onSubmit={handleEditExpense} className="p-4 space-y-3">
              {(editSuccess || editError) && (
                <div className={editSuccess ? "bg-green-50 text-paid text-sm rounded-lg px-4 py-3" : "bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3"}>
                  {editSuccess || editError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Category</label>
                <select className="input-field" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <input className="input-field" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Vendor (optional)</label>
                <input className="input-field" value={editVendor} onChange={(e) => setEditVendor(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount</label>
                <input type="number" min="1" step="0.01" className="input-field" value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Payment Method</label>
                <select className="input-field" value={editMethod} onChange={(e) => setEditMethod(e.target.value as PaymentMethod)}>
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                  <option value="pos">POS</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Date</label>
                <input type="date" className="input-field" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
                <input className="input-field" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
              <button type="submit" disabled={editSubmitting} className="btn-primary w-full">
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
