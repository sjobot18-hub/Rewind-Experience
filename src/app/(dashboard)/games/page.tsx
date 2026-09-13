import { createClient } from "@/lib/supabase/server";
import { getCurrentAdmin, getActiveEvent } from "@/lib/currentAdmin";
import { Game } from "@/lib/types";
import GamesClient from "./games-client";

export default async function GamesPage() {
  const { isOwner, permissions } = await getCurrentAdmin();
  const activeEvent = await getActiveEvent();
  if (!activeEvent) return <p className="text-slate-500">No active event selected.</p>;

  const supabase = createClient();
  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("event_id", activeEvent.id)
    .order("created_at", { ascending: false });

  return (
    <GamesClient
      initialGames={(data as Game[]) ?? []}
      eventId={activeEvent.id}
      isOwner={isOwner}
      permissions={permissions}
    />
  );
}
