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
    <div className="card">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
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
      <div>
        <h1 className="text-xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-slate-500">{d.name} {d.year} — {d.presented_by}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Total Expected Income" value={formatNaira(d.total_expected_income)} />
        <StatCard label="Total Money Received" value={formatNaira(d.total_money_received)} tone="green" />
        <StatCard label="Outstanding Payments" value={formatNaira(outstanding)} tone="orange" />
        <StatCard label="Total Expenses" value={formatNaira(d.total_expenses)} tone="red" />
        <StatCard label="Available Balance" value={formatNaira(d.available_balance)} />
        <StatCard label="Collection Rate" value={`${collectionRate}%`} />
        <StatCard label="Expenses / Received" value={`${expensesPct}%`} />
        <StatCard label="Total Guests" value={String(d.total_guests)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Paid Guests" value={String(d.paid_guests)} tone="green" />
        <StatCard label="Part Payment" value={String(d.part_payment_guests)} tone="orange" />
        <StatCard label="Unpaid Guests" value={String(d.unpaid_guests)} tone="red" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-slate-500 mb-1">Male Guests</p>
          <p className="text-lg font-bold text-navy">{d.male_guests}</p>
          <p className="text-xs text-slate-400">{formatNaira(d.male_ticket_revenue)} revenue</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 mb-1">Female Guests</p>
          <p className="text-lg font-bold text-navy">{d.female_guests}</p>
          <p className="text-xs text-slate-400">{formatNaira(d.female_ticket_revenue)} revenue</p>
        </div>
      </div>
    </div>
  );
}
