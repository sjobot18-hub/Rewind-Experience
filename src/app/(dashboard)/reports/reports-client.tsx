"use client";

import { formatNaira } from "@/lib/format";
import { EventDashboard } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import Papa from "papaparse";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default function ReportsClient({
  dashboard,
  avgPaymentPerGuest,
  eventId,
}: {
  dashboard: EventDashboard;
  avgPaymentPerGuest: number;
  eventId: string;
}) {
  const supabase = createClient();
  const d = dashboard;
  const outstanding = Math.max(d.total_expected_income - d.total_money_received, 0);
  const collectionRate = d.total_expected_income > 0
    ? ((d.total_money_received / d.total_expected_income) * 100).toFixed(1)
    : "0.0";

  async function exportGuestsCsv() {
    const { data } = await supabase.from("guest_financials").select("*").eq("event_id", eventId);
    const csv = Papa.unparse(data ?? []);
    downloadCsv(csv, "guest-register.csv");
  }

  async function exportPaymentsCsv() {
    const { data } = await supabase
      .from("payments")
      .select("*, guests(full_name, guest_code)")
      .eq("event_id", eventId);
    const flat = (data ?? []).map((p: any) => ({
      payment_code: p.payment_code, guest: p.guests?.full_name, guest_code: p.guests?.guest_code,
      amount: p.amount, method: p.payment_method, date: p.paid_at, receipt: p.receipt_number, voided: p.is_voided,
    }));
    downloadCsv(Papa.unparse(flat), "payments.csv");
  }

  async function exportExpensesCsv() {
    const { data } = await supabase.from("expenses").select("*").eq("event_id", eventId);
    downloadCsv(Papa.unparse(data ?? []), "expenses.csv");
  }

  function downloadCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Reports</h1>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-secondary text-sm py-2 px-3">Print</button>
        </div>
      </div>
      <p className="text-sm text-slate-500">{d.name} {d.year}</p>

      <div className="card">
        <Row label="Total Ticket Revenue" value={formatNaira(d.total_expected_income)} />
        <Row label="Total Money Received" value={formatNaira(d.total_money_received)} />
        <Row label="Total Expenses" value={formatNaira(d.total_expenses)} />
        <Row label="Net Balance" value={formatNaira(d.available_balance)} />
        <Row label="Outstanding Payments" value={formatNaira(outstanding)} />
        <Row label="Number of Guests" value={String(d.total_guests)} />
        <Row label="Paid Guests" value={String(d.paid_guests)} />
        <Row label="Part Payment Guests" value={String(d.part_payment_guests)} />
        <Row label="Unpaid Guests" value={String(d.unpaid_guests)} />
        <Row label="Collection Rate" value={`${collectionRate}%`} />
        <Row label="Average Payment Per Guest" value={formatNaira(avgPaymentPerGuest)} />
        <Row label="Total Male Guests" value={String(d.male_guests)} />
        <Row label="Total Female Guests" value={String(d.female_guests)} />
        <Row label="Male Ticket Revenue" value={formatNaira(d.male_ticket_revenue)} />
        <Row label="Female Ticket Revenue" value={formatNaira(d.female_ticket_revenue)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={exportGuestsCsv} className="btn-secondary text-sm py-2">Export Guests</button>
        <button onClick={exportPaymentsCsv} className="btn-secondary text-sm py-2">Export Payments</button>
        <button onClick={exportExpensesCsv} className="btn-secondary text-sm py-2">Export Expenses</button>
      </div>
    </div>
  );
}
