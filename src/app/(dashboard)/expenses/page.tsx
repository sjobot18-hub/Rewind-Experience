import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import ExpensesClient from "./expenses-client";

export default async function ExpensesPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("event_id", activeEvent.id)
    .order("created_at", { ascending: false });

  const { data: dashboard } = await supabase
    .from("event_dashboard")
    .select("available_balance")
    .eq("event_id", activeEvent.id)
    .single();

  return (
    <ExpensesClient
      initialExpenses={expenses ?? []}
      eventId={activeEvent.id}
      availableBalance={dashboard?.available_balance ?? 0}
    />
  );
}
