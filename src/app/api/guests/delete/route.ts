import { createAdminClient } from "@/lib/supabase/admin";
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

    if (!isOwner && !can(permissions as any, isOwner, "manage_guests") && !can(permissions as any, isOwner, "delete_records")) {
      return jsonResponse({ ok: false, message: "Forbidden." }, 403);
    }

    const body = await request.json();
    const guestId = String(body.guest_id ?? "").trim();
    const eventId = String(body.event_id ?? "").trim();

    if (!guestId || !eventId) {
      return jsonResponse({ ok: false, message: "Guest ID and Event ID are required." }, 400);
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("delete_guest_preserve_payments", {
      p_guest_id: guestId,
      p_event_id: eventId,
      p_actor_id: user?.id ?? null,
      p_actor_email: profile?.email ?? "",
    });

    if (error) {
      const message = error.message ?? "Failed to delete guest.";
      const status = message.toLowerCase().includes("guest not found") ? 404 : 500;
      return jsonResponse({ ok: false, message }, status);
    }

    return jsonResponse({
      ok: true,
      message: "Guest removed. Payment history has been preserved.",
      result: data,
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to delete guest." }, 500);
  }
}
