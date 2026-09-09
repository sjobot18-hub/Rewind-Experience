import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCurrentAdmin, getActiveEvent, can } from "@/lib/currentAdmin";

export async function GET(request: Request) {
  try {
    const { profile, permissions, isOwner } = await getCurrentAdmin();
    if (!(isOwner || can(permissions, isOwner, "manage_seats") || can(permissions, isOwner, "manage_event_settings"))) {
      return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
    }

    const event = await getActiveEvent();
    const supabase = createAdminClient();

    const { data: bus } = await supabase
      .from("event_buses")
      .select("*")
      .eq("event_id", event?.id ?? "")
      .eq("name", "Big Costa")
      .maybeSingle();

    if (!bus) {
      return NextResponse.json({ ok: false, message: "Big Costa bus not configured." }, { status: 404 });
    }

    const { data: seats } = await supabase
      .from("bus_seats")
      .select("*")
      .eq("bus_id", bus.id)
      .order("row_number", { ascending: true })
      .order("position_in_row", { ascending: true });

    const { data: assignments } = await supabase
      .from("seat_assignments")
      .select("*, guests:guest_id(full_name, guest_code), payments:payment_id(payment_code, amount), bus_seats(*)")
      .eq("event_id", bus.event_id)
      .eq("bus_id", bus.id)
      .order("updated_at", { ascending: false });

    return NextResponse.json({ ok: true, event, bus, seats: seats ?? [], assignments: assignments ?? [] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat management unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile, permissions, isOwner } = await getCurrentAdmin();
    if (!(isOwner || can(permissions, isOwner, "manage_seats") || can(permissions, isOwner, "manage_event_settings"))) {
      return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body.action ?? "");
    const event = await getActiveEvent();
    const supabase = createAdminClient();

    if (action === "release") {
      const assignmentId = String(body.assignment_id ?? "");
      const { error } = await supabase
        .from("seat_assignments")
        .update({ status: "released", updated_at: new Date().toISOString() })
        .eq("id", assignmentId)
        .eq("event_id", event?.id ?? "");

      if (error) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
      }

      return NextResponse.json({ ok: true, message: "Seat released." });
    }

    return NextResponse.json({ ok: false, message: "Unsupported admin seat action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat management failed." }, { status: 500 });
  }
}
