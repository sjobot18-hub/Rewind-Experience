import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCurrentAdmin, can } from "@/lib/currentAdmin";

function jsonResponse(data: Record<string, any>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function POST(request: Request) {
  try {
    const { user, profile, permissions, isOwner } = await getCurrentAdmin();

    if (!isOwner && !can(permissions as any, isOwner, "manage_event_settings")) {
      return jsonResponse({ ok: false, message: "Forbidden." }, 403);
    }

    const body = await request.json();
    const gameId = String(body.id ?? "").trim();
    const eventId = String(body.event_id ?? "").trim();

    if (!gameId) {
      return jsonResponse({ ok: false, message: "Game ID is required." }, 400);
    }
    if (!eventId) {
      return jsonResponse({ ok: false, message: "Event ID is required." }, 400);
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("games")
      .select("id, status, completed_at")
      .eq("id", gameId)
      .eq("event_id", eventId)
      .single();

    if (!existing) {
      return jsonResponse({ ok: false, message: "Game not found." }, 404);
    }

    const isCompleting = existing.status === "pending";

    const updateData: Record<string, any> = {
      status: isCompleting ? "completed" : "pending",
      updated_at: new Date().toISOString(),
      completed_at: isCompleting ? new Date().toISOString() : null,
    };

    const { data: game, error } = await supabase
      .from("games")
      .update(updateData)
      .eq("id", gameId)
      .eq("event_id", eventId)
      .select("*")
      .single();

    if (error || !game) {
      return jsonResponse({ ok: false, message: error?.message ?? "Failed to update game." }, 500);
    }

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      actor_id: user?.id ?? "",
      actor_email: profile?.email ?? "",
      action: isCompleting ? "game_completed" : "game_reopened",
      record_type: "game",
      record_id: gameId,
      previous_value: existing,
      new_value: game,
    });

    return jsonResponse({ ok: true, game, message: isCompleting ? "Game marked as completed." : "Game reopened as pending." });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to update game status." }, 500);
  }
}
