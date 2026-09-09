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
    <div className="card min-w-0 px-4 py-3">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className={`text-[30px] md:text-[34px] font-bold leading-none break-words ${toneClass}`}>{value}</p>
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
    <div className="space-y-5 dashboard-mobile">
      <section className="space-y-1">
        <h1 className="text-[28px] md:text-[32px] font-bold leading-tight text-navy">Dashboard</h1>
        <p className="text-[15px] md:text-[16px] text-slate-500 leading-tight">Live figures for {d.name}</p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Link href="/guests" className="btn-primary text-[13px] font-semibold px-2 py-2 h-11 flex items-center justify-center">Add guest</Link>
        <Link href="/payments" className="btn-primary text-[13px] font-semibold px-2 py-2 h-11 flex items-center justify-center">Payment</Link>
        <Link href="/expenses" className="btn-primary text-[13px] font-semibold px-2 py-2 h-11 flex items-center justify-center">Expense</Link>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <div className="card px-4 py-3">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Male Guests</p>
          <p className="text-[30px] font-bold leading-none text-navy">{d.male_guests}</p>
          <p className="text-[13px] text-slate-400 mt-1">{formatNaira(d.male_ticket_revenue)} revenue</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Female Guests</p>
          <p className="text-[30px] font-bold leading-none text-navy">{d.female_guests}</p>
          <p className="text-[13px] text-slate-400 mt-1">{formatNaira(d.female_ticket_revenue)} revenue</p>
        </div>
      </section>
    </div>
  );
}
