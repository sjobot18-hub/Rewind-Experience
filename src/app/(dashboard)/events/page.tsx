import { createClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/currentAdmin";
import EventsClient from "./events-client";

export default async function EventsPage() {
  const { isOwner } = await getCurrentAdmin();
  const supabase = createClient();
  const { data: events } = await supabase.from("events").select("*").order("year", { ascending: false });

  return <EventsClient events={events ?? []} isOwner={isOwner} />;
}
