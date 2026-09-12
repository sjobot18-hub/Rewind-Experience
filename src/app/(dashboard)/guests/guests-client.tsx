"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/format";
import { GuestFinancials } from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  const cls = status === "paid" ? "badge-paid" : status === "part_payment" ? "badge-part" : "badge-unpaid";
  const label = status === "paid" ? "Paid" : status === "part_payment" ? "Part Payment" : "Unpaid";
  return <span className={cls}>{label}</span>;
}

export default function GuestsClient({
  initialGuests,
  eventId,
  mensPrice,
  womensPrice,
}: {
  initialGuests: GuestFinancials[];
  eventId: string;
  mensPrice: number;
  womensPrice: number;
}) {
  const supabase = createClient();
  const [guests, setGuests] = useState(initialGuests);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestFinancials | null>(null);
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState<"male" | "female">("male");
  const [editAmountPaid, setEditAmountPaid] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingGuest, setDeletingGuest] = useState<GuestFinancials | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return guests.filter((g) => {
      const matchesSearch =
        !search ||
        g.full_name.toLowerCase().includes(search.toLowerCase()) ||
        g.phone_number.includes(search) ||
        g.guest_code.toLowerCase().includes(search.toLowerCase());
      const matchesGender = genderFilter === "all" || g.gender === genderFilter;
      const matchesStatus = statusFilter === "all" || g.status === statusFilter;
      return matchesSearch && matchesGender && matchesStatus;
    });
  }, [guests, search, genderFilter, statusFilter]);

  async function refreshGuests() {
    const { data } = await supabase
      .from("guest_financials")
      .select("*")
      .eq("event_id", eventId)
      .order("guest_code", { ascending: true });
    setGuests((data as GuestFinancials[]) ?? []);
  }

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !phone.trim()) {
      setError("Name and phone number are required.");
      return;
    }
    if (!/^[0-9+][0-9\s-]{6,}$/.test(phone.trim())) {
      setError("Enter a valid phone number.");
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("register_guest", {
      p_event_id: eventId,
      p_full_name: name.trim(),
      p_phone_number: phone.trim(),
      p_gender: gender,
      p_notes: notes.trim() || null,
    });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setName("");
    setPhone("");
    setNotes("");
    setGender("male");
    setShowForm(false);
    await refreshGuests();
  }

  function openEdit(guest: GuestFinancials) {
    setEditingGuest(guest);
    setEditName(guest.full_name);
    setEditGender(guest.gender);
    setEditAmountPaid(String(guest.total_paid));
    setEditError(null);
    setEditSuccess(null);
    setEditOpen(true);
  }

  async function handleEditGuest(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);

    if (!editName.trim()) {
      setEditError("Name cannot be empty.");
      return;
    }
    if (editGender !== "male" && editGender !== "female") {
      setEditError("Invalid gender.");
      return;
    }
    const amt = parseFloat(editAmountPaid);
    if (Number.isNaN(amt) || amt < 0) {
      setEditError("Amount paid must be a valid non-negative number.");
      return;
    }

    if (!editingGuest) return;

    setEditSubmitting(true);
    try {
      const res = await fetch("/api/guests/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: editingGuest.guest_id,
          event_id: eventId,
          full_name: editName.trim(),
          gender: editGender,
          amount_paid: amt > 0 ? amt : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setEditError(data.message ?? "Failed to update guest.");
        return;
      }
      setEditSuccess("Guest information updated successfully.");
      await refreshGuests();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to update guest.");
    }
    setEditSubmitting(false);
  }

  function openDelete(guest: GuestFinancials) {
    setDeletingGuest(guest);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function handleDeleteGuest() {
    setDeleteError(null);
    if (!deletingGuest) return;

    setDeleteSubmitting(true);
    try {
      const res = await fetch("/api/guests/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: deletingGuest.guest_id,
          event_id: eventId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setDeleteError(data.message ?? "Failed to delete guest.");
        return;
      }
      setDeleteOpen(false);
      await refreshGuests();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete guest.");
    }
    setDeleteSubmitting(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Guests</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm py-2 px-4">
          {showForm ? "Cancel" : "+ Add Guest"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddGuest} className="card space-y-3">
          {error && <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone Number</label>
            <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Gender</label>
            <select className="input-field" value={gender} onChange={(e) => setGender(e.target.value as "male" | "female")}>
              <option value="male">Male — {formatNaira(mensPrice)}</option>
              <option value="female">Female — {formatNaira(womensPrice)}</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">Ticket fee is assigned automatically based on gender.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Saving..." : "Register Guest"}
          </button>
        </form>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="input-field flex-1"
          placeholder="Search by name, phone, or Guest ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-field sm:w-40" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
          <option value="all">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <select className="input-field sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="part_payment">Part Payment</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {filtered.map((g) => (
          <div key={g.guest_id}>
            <Link href={`/guests/${g.guest_id}`} className="card block">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{g.full_name}</p>
                  <p className="text-xs text-slate-400">{g.guest_code} · {g.phone_number}</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
              <div className="flex justify-between mt-3 text-sm">
                <span className="text-slate-500">Paid {formatNaira(g.total_paid)}</span>
                <span className="font-medium">Balance {formatNaira(g.balance)}</span>
              </div>
              {g.is_overpaid && (
                <p className="text-xs text-part mt-1">Overpaid by {formatNaira(g.overpayment_amount)}</p>
              )}
            </Link>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => openEdit(g)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Edit
              </button>
              <button
                onClick={() => openDelete(g)}
                className="btn-destructive text-xs py-1.5 px-3"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-slate-400 text-sm">No guests found.</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Guest ID</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Gender</th>
              <th className="py-2 pr-4">Ticket Fee</th>
              <th className="py-2 pr-4">Paid</th>
              <th className="py-2 pr-4">Balance</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.guest_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4">
                  <Link href={`/guests/${g.guest_id}`} className="text-blue font-medium">{g.guest_code}</Link>
                </td>
                <td className="py-2 pr-4">{g.full_name}</td>
                <td className="py-2 pr-4">{g.phone_number}</td>
                <td className="py-2 pr-4 capitalize">{g.gender}</td>
                <td className="py-2 pr-4">{formatNaira(g.ticket_fee)}</td>
                <td className="py-2 pr-4">{formatNaira(g.total_paid)}</td>
                <td className="py-2 pr-4">{formatNaira(g.balance)}</td>
                <td className="py-2 pr-4"><StatusBadge status={g.status} /></td>
                <td className="py-2 pr-4">
                  <button onClick={() => openEdit(g)} className="text-xs text-blue font-medium">Edit</button>
                  <button onClick={() => openDelete(g)} className="text-xs text-unpaid font-medium ml-2">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm py-4">No guests found.</p>}
      </div>

      {editOpen && editingGuest && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-50 p-3">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-black text-slate-800">Edit Guest</div>
                <div className="text-xs text-slate-500">{editingGuest.guest_code} · {editingGuest.full_name}</div>
              </div>
              <button onClick={() => setEditOpen(false)} className="btn-secondary text-xs py-1.5 px-3">Close</button>
            </div>
            <form onSubmit={handleEditGuest} className="p-4 space-y-3">
              {(editSuccess || editError) && (
                <div className={editSuccess ? "bg-green-50 text-paid text-sm rounded-lg px-4 py-3" : "bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3"}>
                  {editSuccess || editError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Full Name</label>
                <input className="input-field" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Gender</label>
                <select className="input-field" value={editGender} onChange={(e) => setEditGender(e.target.value as "male" | "female")}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount Paid (₦)</label>
                <input type="number" min="0" step="0.01" className="input-field" value={editAmountPaid}
                  onChange={(e) => setEditAmountPaid(e.target.value)} />
              </div>
              <button type="submit" disabled={editSubmitting} className="btn-primary w-full">
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteOpen && deletingGuest && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-50 p-3">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-black text-slate-800">Delete Guest</div>
                <div className="text-xs text-slate-500">{deletingGuest.guest_code}</div>
              </div>
              <button onClick={() => setDeleteOpen(false)} className="btn-secondary text-xs py-1.5 px-3">Close</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-slate-700">Delete this guest?</p>
              <p className="font-semibold text-slate-900">{deletingGuest.full_name}</p>
              {deleteError && (
                <div className="bg-red-50 text-unpaid text-sm rounded-lg px-4 py-3">{deleteError}</div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setDeleteOpen(false)} disabled={deleteSubmitting} className="btn-secondary py-2 px-4">
                  Cancel
                </button>
                <button onClick={handleDeleteGuest} disabled={deleteSubmitting} className="bg-unpaid text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                  {deleteSubmitting ? "Deleting..." : "Delete Guest"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
