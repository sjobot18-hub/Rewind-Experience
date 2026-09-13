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

export async function PUT(request: Request) {
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
      .select("*")
      .eq("id", gameId)
      .eq("event_id", eventId)
      .single();

    if (!existing) {
      return jsonResponse({ ok: false, message: "Game not found." }, 404);
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const location = body.location !== undefined ? String(body.location).trim() : undefined;
    const description = body.description !== undefined ? String(body.description).trim() : undefined;
    const tiktokUrl = body.tiktok_url !== undefined ? String(body.tiktok_url).trim() : undefined;
    const notes = body.notes !== undefined ? String(body.notes).trim() : undefined;

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (name !== undefined) {
      if (!name) {
        return jsonResponse({ ok: false, message: "Game name cannot be empty." }, 400);
      }
      updateData.name = name;
    }

    if (location !== undefined) {
      if (location !== "beach" && location !== "apartment") {
        return jsonResponse({ ok: false, message: "Location must be beach or apartment." }, 400);
      }
      updateData.location = location;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (tiktokUrl !== undefined) {
      if (tiktokUrl) {
        try {
          new URL(tiktokUrl);
        } catch {
          return jsonResponse({ ok: false, message: "Invalid TikTok URL." }, 400);
        }
      }
      updateData.tiktok_url = tiktokUrl || null;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    if (Object.keys(updateData).length === 1) {
      return jsonResponse({ ok: false, message: "No fields to update." }, 400);
    }

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
      action: "game_updated",
      record_type: "game",
      record_id: gameId,
      new_value: game,
    });

    return jsonResponse({ ok: true, game, message: "Game updated successfully." });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to update game." }, 500);
  }
}

export async function DELETE(request: Request) {
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
      .select("*")
      .eq("id", gameId)
      .eq("event_id", eventId)
      .single();

    if (!existing) {
      return jsonResponse({ ok: false, message: "Game not found." }, 404);
    }

    const previousData = { ...existing };

    const { error } = await supabase
      .from("games")
      .delete()
      .eq("id", gameId)
      .eq("event_id", eventId);

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 500);
    }

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      actor_id: user?.id ?? "",
      actor_email: profile?.email ?? "",
      action: "game_deleted",
      record_type: "game",
      record_id: gameId,
      previous_value: previousData,
      new_value: null,
    });

    return jsonResponse({ ok: true, message: "Game deleted successfully." });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to delete game." }, 500);
  }
}
