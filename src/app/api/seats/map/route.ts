import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBusSeatType, seatDisplayNameFromAssignment } from "@/lib/seats";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedEventId = (searchParams.get("event_id") ?? "").trim();
    const supabase = createAdminClient();

    let busQuery = supabase.from("event_buses").select("*").eq("name", "Big Costa");
    if (requestedEventId) {
      busQuery = busQuery.eq("event_id", requestedEventId);
    }

    const { data: bus, error: busError } = await busQuery.maybeSingle();
    if (busError || !bus) {
      return NextResponse.json({ ok: false, message: "Big Costa bus not configured for the requested event." }, { status: 404 });
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", bus.event_id)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ ok: false, message: "Seat event could not be resolved from the Big Costa bus." }, { status: 404 });
    }

    const { data: seats, error: seatError } = await supabase
      .from("bus_seats")
      .select("*")
      .eq("bus_id", bus.id)
      .order("row_number", { ascending: true })
      .order("position_in_row", { ascending: true });

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
      if (row.status === "occupied") {
        assignmentBySeat.set(row.seat_id, row);
      }
    }

    const output = (seats ?? []).map((seat: any) => {
      const assignment = assignmentBySeat.get(seat.id);
      const disabled = Boolean(seat.is_disabled);
      const publicSeatType = normalizeBusSeatType(seat.seat_type);

      if (disabled) {
        return {
          seat_id: seat.id,
          seat_number: seat.seat_number,
          status: "disabled",
          display_name: "DISABLED",
          seat_type: publicSeatType,
          row_number: seat.row_number,
          position_in_row: seat.position_in_row,
          is_disabled: true,
        };
      }

      if (!assignment) {
        return {
          seat_id: seat.id,
          seat_number: seat.seat_number,
          status: "available",
          display_name: "AVAILABLE",
          seat_type: publicSeatType,
          row_number: seat.row_number,
          position_in_row: seat.position_in_row,
          is_disabled: false,
        };
      }

      return {
        seat_id: seat.id,
        seat_number: seat.seat_number,
        status: assignment.status === "occupied" ? "occupied" : "available",
        display_name: seatDisplayNameFromAssignment(assignment),
        seat_type: publicSeatType,
        row_number: seat.row_number,
        position_in_row: seat.position_in_row,
        is_disabled: false,
      };
    });

    return NextResponse.json({ ok: true, event, bus, seats: output, event_id: bus.event_id, bus_id: bus.id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat map failed." }, { status: 500 });
  }
}
