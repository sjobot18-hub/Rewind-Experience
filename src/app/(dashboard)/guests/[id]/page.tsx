import { createClient } from "@/lib/supabase/server";
import { getActiveEvent } from "@/lib/currentAdmin";
import { notFound } from "next/navigation";
import { GuestFinancials, Payment } from "@/lib/types";
import GuestProfileClient from "./profile-client";

export default async function GuestProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: guest } = await supabase
    .from("guest_financials")
    .select("*")
    .eq("guest_id", params.id)
    .single();

  if (!guest) notFound();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("guest_id", params.id)
    .order("created_at", { ascending: false });

  const activeEvent = await getActiveEvent((guest as GuestFinancials).event_id);

  return (
    <GuestProfileClient
      guest={guest as GuestFinancials}
      payments={(payments as Payment[]) ?? []}
      eventName={activeEvent ? `${activeEvent.name} ${activeEvent.year}` : ""}
      presentedBy={activeEvent?.presented_by ?? ""}
    />
  );
}
