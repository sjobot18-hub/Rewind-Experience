import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("event_id") || "";
    const supabase = createAdminClient();

    let busQuery = supabase.from("event_buses").select("*").eq("name", "Big Costa");
    if (eventId) {
      busQuery = busQuery.eq("event_id", eventId);
    }

    const { data: bus, error: busError } = await busQuery.maybeSingle();
    if (busError || !bus) {
      return NextResponse.json({ ok: false, message: "Big Costa bus not configured." }, { status: 404 });
    }

    const { data: seats, error: seatError } = await supabase
      .from("bus_seats")
      .select("*")
      .eq("bus_id", bus.id)
      .order("seat_number");

    if (seatError) {
      return NextResponse.json({ ok: false, message: "Unable to load bus seats." }, { status: 500 });
    }

    const { data: assignments } = await supabase
      .from("seat_assignments")
      .select("*, guests:guest_id(full_name)")
      .eq("event_id", bus.event_id)
      .eq("bus_id", bus.id)
      .neq("status", "released");

    const assignmentBySeat = new Map<string, any>();
    for (const row of assignments ?? []) {
      assignmentBySeat.set(row.seat_id, row);
    }

    const output = (seats ?? []).map((seat: any) => {
      const assignment = assignmentBySeat.get(seat.id);
      const disabled = Boolean(seat.is_disabled);

      if (disabled) {
        return { seat_id: seat.id, seat_number: seat.seat_number, status: "disabled", display_name: "DISABLED" };
      }

      if (!assignment || assignment.status === "released") {
        return { seat_id: seat.id, seat_number: seat.seat_number, status: "available", display_name: "AVAILABLE" };
      }

      const firstName = assignment.guests?.full_name?.trim().split(/\s+/)[0] || "Member";
      return {
        seat_id: seat.id,
        seat_number: seat.seat_number,
        status: assignment.status === "occupied" ? "occupied" : "released",
        display_name: firstName,
      };
    });

    return NextResponse.json({ ok: true, seats: output, event_id: bus.event_id, bus_id: bus.id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat map failed." }, { status: 500 });
  }
}
