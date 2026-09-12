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

    if (!guestId) {
      return jsonResponse({ ok: false, message: "Guest ID is required." }, 400);
    }
    if (!eventId) {
      return jsonResponse({ ok: false, message: "Event ID is required." }, 400);
    }

    const supabase = createAdminClient();

    const { data: guest } = await supabase
      .from("guests")
      .select("*")
      .eq("id", guestId)
      .eq("event_id", eventId)
      .single();

    if (!guest) {
      return jsonResponse({ ok: false, message: "Guest not found." }, 404);
    }

    const { data: payments } = await supabase
      .from("payments")
      .select("id")
      .eq("guest_id", guestId)
      .eq("event_id", eventId);

    if ((payments ?? []).length > 0) {
      return jsonResponse(
        { ok: false, message: "This guest cannot be deleted because payment records exist for this guest. Void or otherwise resolve the payment records first." },
        400
      );
    }

    const { data: seatAssignments } = await supabase
      .from("seat_assignments")
      .select("id, status")
      .eq("guest_id", guestId)
      .eq("event_id", eventId);

    const activeSeatAssignments = (seatAssignments ?? []).filter((sa) => sa.status === "occupied");
    if (activeSeatAssignments.length > 0) {
      return jsonResponse(
        { ok: false, message: "This guest cannot be deleted because they currently have a seat assignment. Release the seat first." },
        400
      );
    }

    const { data: auditLogs } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("record_type", "guest")
      .eq("record_id", guestId)
      .limit(1);

    const previousGuestData = {
      id: guest.id,
      event_id: guest.event_id,
      guest_code: guest.guest_code,
      full_name: guest.full_name,
      phone_number: guest.phone_number,
      gender: guest.gender,
      ticket_fee: guest.ticket_fee,
      notes: guest.notes,
      registered_at: guest.registered_at,
      registered_by: guest.registered_by,
    };

    const { error: deleteError } = await supabase
      .from("guests")
      .delete()
      .eq("id", guestId)
      .eq("event_id", eventId);

    if (deleteError) {
      return jsonResponse({ ok: false, message: deleteError.message }, 500);
    }

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      actor_id: user?.id ?? "",
      actor_email: profile?.email ?? "",
      action: "guest_deleted",
      record_type: "guest",
      record_id: guestId,
      previous_value: previousGuestData,
      new_value: null,
    });

    return jsonResponse({
      ok: true,
      message: "Guest deleted successfully.",
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to delete guest." }, 500);
  }
}