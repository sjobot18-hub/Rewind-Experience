import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { GuestFinancials } from "@/lib/types";
import GuestsClient from "./guests-client";

export default async function GuestsPage() {
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();
  const { data } = await supabase
    .from("guest_financials")
    .select("*")
    .eq("event_id", activeEvent.id)
    .order("guest_code", { ascending: true });

  return (
    <GuestsClient
      initialGuests={(data as GuestFinancials[]) ?? []}
      eventId={activeEvent.id}
      mensPrice={activeEvent.mens_ticket_price}
      womensPrice={activeEvent.womens_ticket_price}
    />
  );
}
