import { createAdminClient } from "@/lib/supabase/admin";
import { getPermanentBigCostaBus, normalizeBusSeatType, seatDisplayNameFromAssignment } from "@/lib/seats";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const bus = await getPermanentBigCostaBus(supabase);

    if (!bus) {
      return NextResponse.json({ ok: false, message: "Big Costa bus not configured for the permanent seat map." }, { status: 404 });
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
      .eq("bus_id", bus.id)
      .neq("status", "released");

    const assignmentBySeat = new Map<string, any>();
    for (const row of assignments ?? []) {
      if (row.status === "occupied") {
        assignmentBySeat.set(String(row.seat_id), row);
      }
    }

    const output = (seats ?? []).map((seat: any) => {
      const assignment = assignmentBySeat.get(String(seat.id));
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

    return NextResponse.json({ ok: true, event: null, bus, seats: output, event_id: bus.event_id ?? null, bus_id: bus.id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat map failed." }, { status: 500 });
  }
}
