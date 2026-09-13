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

export async function GET(request: Request) {
  try {
    const { permissions, isOwner } = await getCurrentAdmin();

    if (!isOwner && !can(permissions as any, isOwner, "manage_event_settings")) {
      return jsonResponse({ ok: false, message: "Forbidden." }, 403);
    }

    const { searchParams } = new URL(request.url);
    const eventId = String(searchParams.get("event_id") ?? "").trim();

    if (!eventId) {
      return jsonResponse({ ok: false, message: "Event ID is required." }, 400);
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("games")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    return jsonResponse({ ok: true, games: (data ?? []) });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to fetch games." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile, permissions, isOwner } = await getCurrentAdmin();

    if (!isOwner && !can(permissions as any, isOwner, "manage_event_settings")) {
      return jsonResponse({ ok: false, message: "Forbidden." }, 403);
    }

    const body = await request.json();
    const eventId = String(body.event_id ?? "").trim();
    const name = String(body.name ?? "").trim();
    const location = String(body.location ?? "").trim();
    const description = body.description !== undefined ? String(body.description).trim() : "";
    const tiktokUrl = body.tiktok_url !== undefined ? String(body.tiktok_url).trim() : "";
    const notes = body.notes !== undefined ? String(body.notes).trim() : "";

    if (!name) {
      return jsonResponse({ ok: false, message: "Game name is required." }, 400);
    }
    if (!location) {
      return jsonResponse({ ok: false, message: "Location is required." }, 400);
    }
    if (location !== "beach" && location !== "apartment") {
      return jsonResponse({ ok: false, message: "Location must be beach or apartment." }, 400);
    }
    if (tiktokUrl) {
      try {
        new URL(tiktokUrl);
      } catch {
        return jsonResponse({ ok: false, message: "Invalid TikTok URL." }, 400);
      }
    }

    const supabase = createAdminClient();

    const { data: game, error } = await supabase
      .from("games")
      .insert({
        event_id: eventId,
        name,
        location,
        description: description || null,
        tiktok_url: tiktokUrl || null,
        notes: notes || null,
        status: "pending",
      })
      .select("*")
      .single();

    if (error || !game) {
      return jsonResponse({ ok: false, message: error?.message ?? "Failed to create game." }, 500);
    }

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      actor_id: user?.id ?? "",
      actor_email: profile?.email ?? "",
      action: "game_created",
      record_type: "game",
      record_id: game.id,
      new_value: game,
    });

    return jsonResponse({ ok: true, game, message: "Game created successfully." });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to create game." }, 500);
  }
}
