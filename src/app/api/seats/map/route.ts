import { createAdminClient } from "@/lib/supabase/admin";
import { getPermanentBigCostaBus, getActiveEventId, getSmallCostaBus, normalizeBusSeatType, seatDisplayNameFromAssignment, SEAT_ELIGIBILITY_THRESHOLD } from "@/lib/seats";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();

    const url = new URL(request.url);
    const busName = url.searchParams.get("bus") ?? "Big Costa";
    const isSmallCosta = busName === "Small Costa";
    const paymentId = (url.searchParams.get("paymentId") ?? "").trim();

    // Both Costa maps require a valid payment ID and an open seat-selection window.
    if (!paymentId) {
      return NextResponse.json(
        { ok: false, message: "Verify your payment ID before viewing seats." },
        { status: 401 }
      );
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("guest_id, event_id, is_voided, public_payment_id")
      .ilike("public_payment_id", paymentId)
      .maybeSingle();

    if (paymentError || !payment || payment.is_voided || !payment.guest_id || !payment.event_id) {
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 403 });
    }

    const { data: validPayments, error: validPaymentsError } = await supabase
      .from("payments")
      .select("amount")
      .eq("guest_id", payment.guest_id)
      .eq("event_id", payment.event_id)
      .eq("is_voided", false);

    const totalPaid = (validPayments ?? []).reduce(
      (sum: number, row: any) => sum + Number(row.amount ?? 0),
      0
    );

    if (validPaymentsError || totalPaid < SEAT_ELIGIBILITY_THRESHOLD) {
      return NextResponse.json(
        { ok: false, message: "You need at least ₦5,000 total valid payment before viewing seats." },
        { status: 403 }
      );
    }

    let bus: any;
    if (isSmallCosta) {
      bus = await getSmallCostaBus(supabase, payment.event_id);
    } else {
      bus = await getPermanentBigCostaBus(supabase);
    }

    if (!bus) {
      const notConfigured = isSmallCosta
        ? "Small Costa bus not configured for this event."
        : "Big Costa bus not configured for the permanent seat map.";
      return NextResponse.json({ ok: false, message: notConfigured }, { status: 404 });
    }

    if (!bus.event_id || bus.event_id !== payment.event_id) {
      return NextResponse.json(
        { ok: false, message: "Payment belongs to a different event." },
        { status: 403 }
      );
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, seat_selection_open, seat_selection_deadline")
      .eq("id", payment.event_id)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ ok: false, message: "Unable to verify seat-selection status." }, { status: 500 });
    }

    if (!event.seat_selection_open) {
      return NextResponse.json({ ok: false, message: "Seat selection is currently closed." }, { status: 403 });
    }

    if (event.seat_selection_deadline) {
      const deadline = new Date(event.seat_selection_deadline);
      if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()) {
        return NextResponse.json({ ok: false, message: "Seat selection deadline has passed." }, { status: 403 });
      }
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

    const { data: assignments, error: assignmentError } = await supabase
      .from("seat_assignments")
      .select("*, guests:guest_id(full_name)")
      .eq("bus_id", bus.id)
      .eq("event_id", bus.event_id)
      .neq("status", "released");

    if (assignmentError) {
      return NextResponse.json({ ok: false, message: "Unable to load seat assignments." }, { status: 500 });
    }

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
          guest_name: null,
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
          guest_name: null,
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
        guest_name: seatDisplayNameFromAssignment(assignment),
        seat_type: publicSeatType,
        row_number: seat.row_number,
        position_in_row: seat.position_in_row,
        is_disabled: false,
      };
    });

    return NextResponse.json(
      { ok: true, event: null, bus, seats: output, event_id: bus.event_id, bus_id: bus.id },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate", Pragma: "no-cache", Expires: "0" } }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat map failed." }, { status: 500 });
  }
}
