import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import PaymentsClient from "./payments-client";

export default async function PaymentsPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("*, guests(full_name, guest_code)")
    .eq("event_id", activeEvent.id)
    .order("created_at", { ascending: false });

  const { data: guests } = await supabase
    .from("guest_financials")
    .select("guest_id, guest_code, full_name, balance, ticket_fee")
    .eq("event_id", activeEvent.id)
    .order("guest_code");

  return (
    <PaymentsClient
      initialPayments={payments ?? []}
      guests={guests ?? []}
      eventId={activeEvent.id}
    />
  );
}
