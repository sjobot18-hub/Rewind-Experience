import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { EventDashboard } from "@/lib/types";
import ReportsClient from "./reports-client";

export default async function ReportsPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();
  const { data: dashboard } = await supabase
    .from("event_dashboard")
    .select("*")
    .eq("event_id", activeEvent.id)
    .single();

  const { data: payments } = await supabase
    .from("payments")
    .select("amount, is_voided")
    .eq("event_id", activeEvent.id);

  const activePayments = (payments ?? []).filter((p) => !p.is_voided);
  const avgPayment = activePayments.length
    ? activePayments.reduce((s, p) => s + Number(p.amount), 0) / activePayments.length
    : 0;

  return (
    <ReportsClient
      dashboard={dashboard as EventDashboard}
      avgPaymentPerGuest={avgPayment}
      eventId={activeEvent.id}
    />
  );
}
