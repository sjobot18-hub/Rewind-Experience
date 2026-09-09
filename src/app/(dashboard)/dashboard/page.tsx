import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { formatNaira } from "@/lib/format";
import { EventDashboard } from "@/lib/types";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "orange" | "red" | "default" }) {
  const toneClass = {
    green: "text-paid",
    orange: "text-part",
    red: "text-unpaid",
    default: "text-navy",
  }[tone ?? "default"];

  return (
    <div className="card min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold leading-tight break-words ${toneClass}`}>{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) {
    return <p className="text-slate-500">No active event. Ask the Owner to activate one from Events.</p>;
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("event_dashboard")
    .select("*")
    .eq("event_id", activeEvent.id)
    .single();

  const d = data as EventDashboard | null;

  if (!d) {
    return <p className="text-slate-500">Unable to load dashboard figures.</p>;
  }

  const collectionRate = d.total_expected_income > 0
    ? ((d.total_money_received / d.total_expected_income) * 100).toFixed(1)
    : "0.0";

  const outstanding = Math.max(d.total_expected_income - d.total_money_received, 0);

  const expensesPct = d.total_money_received > 0
    ? ((d.total_expenses / d.total_money_received) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold">The Rewind Experience</p>
            <h1 className="text-2xl md:text-3xl font-bold text-navy mt-1">{activeEvent.name}</h1>
            <p className="text-sm text-slate-500">{activeEvent.name} · {activeEvent.year}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Presented by</p>
            <p className="text-sm font-bold text-navy">{d.presented_by}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-bold text-navy">Dashboard</h2>
          <p className="text-sm text-slate-500">Live figures for {d.name}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/guests" className="btn-primary text-sm px-4 py-2.5">Add guest</Link>
          <Link href="/payments" className="btn-primary text-sm px-4 py-2.5">Payment</Link>
          <Link href="/expenses" className="btn-primary text-sm px-4 py-2.5">Expense</Link>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Total Expected Income" value={formatNaira(d.total_expected_income)} />
        <StatCard label="Total Money Received" value={formatNaira(d.total_money_received)} tone="green" />
        <StatCard label="Outstanding Payments" value={formatNaira(outstanding)} tone="red" />
        <StatCard label="Total Expenses" value={formatNaira(d.total_expenses)} tone="red" />
        <StatCard label="Available Balance" value={formatNaira(d.available_balance)} />
        <StatCard label="Collection Rate" value={`${collectionRate}%`} />
        <StatCard label="Expenses / Received" value={`${expensesPct}%`} />
        <StatCard label="Total Guests" value={String(d.total_guests)} />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Paid Guests" value={String(d.paid_guests)} tone="green" />
        <StatCard label="Part Payment" value={String(d.part_payment_guests)} tone="orange" />
        <StatCard label="Unpaid Guests" value={String(d.unpaid_guests)} tone="red" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Male Guests</p>
          <p className="text-2xl font-bold text-navy">{d.male_guests}</p>
          <p className="text-xs text-slate-400">{formatNaira(d.male_ticket_revenue)} revenue</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Female Guests</p>
          <p className="text-2xl font-bold text-navy">{d.female_guests}</p>
          <p className="text-xs text-slate-400">{formatNaira(d.female_ticket_revenue)} revenue</p>
        </div>
      </section>
    </div>
  );
}
