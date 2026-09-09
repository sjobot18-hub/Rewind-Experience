import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getCurrentAdmin, getActiveEvent, can } from "@/lib/currentAdmin";
import { SEAT_ELIGIBILITY_THRESHOLD } from "@/lib/seats";

function authorizeAdmin(permissions: string[], isOwner: boolean) {
  return isOwner || can(permissions as any, isOwner, "manage_seats") || can(permissions as any, isOwner, "manage_event_settings");
}

export async function GET(request: Request) {
  try {
    const { profile, permissions, isOwner } = await getCurrentAdmin();
    if (!authorizeAdmin(permissions, isOwner)) {
      return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
    }

    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json({ ok: false, message: "No active event configured." }, { status: 404 });
    }

    const supabase = createAdminClient();

    const { data: bus } = await supabase
      .from("event_buses")
      .select("*")
      .eq("event_id", event.id)
      .eq("name", "Big Costa")
      .maybeSingle();

    if (!bus) {
      return NextResponse.json({ ok: false, message: "Big Costa bus not configured." }, { status: 404 });
    }

    const { data: seats = [] } = await supabase
      .from("bus_seats")
      .select("*")
      .eq("bus_id", bus.id)
      .order("row_number", { ascending: true })
      .order("position_in_row", { ascending: true });

    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("seat_assignments")
      .select("*, guests:guest_id(full_name, guest_code, id), payments:payment_id(payment_code, amount, is_voided, id), bus_seats(*)")
      .eq("event_id", event.id)
      .eq("bus_id", bus.id)
      .order("updated_at", { ascending: false });

    if (assignmentError) {
      return NextResponse.json({ ok: false, message: assignmentError.message ?? "Unable to load seat assignments." }, { status: 500 });
    }

    const assignments = assignmentRows ?? [];

    const map = new Map<string, any>();
    for (const assignment of assignments) {
      if (assignment.status === "occupied") {
        map.set(assignment.seat_id, assignment);
      }
    }

    const seatRows = (seats ?? []).map((seat: any) => {
      const assignment = map.get(seat.id);
      const isDisabled = Boolean(seat.is_disabled);
      if (isDisabled) {
        return {
          seat_id: seat.id,
          seat_number: seat.seat_number,
          row_number: seat.row_number,
          position_in_row: seat.position_in_row,
          seat_type: seat.seat_type,
          status: "disabled",
          display_name: "DISABLED",
          is_disabled: true,
          guest_id: null,
        };
      }

      if (!assignment) {
        return {
          seat_id: seat.id,
          seat_number: seat.seat_number,
          row_number: seat.row_number,
          position_in_row: seat.position_in_row,
          seat_type: seat.seat_type,
          status: "available",
          display_name: "AVAILABLE",
          is_disabled: false,
          guest_id: null,
        };
      }

      return {
        seat_id: seat.id,
        seat_number: seat.seat_number,
        row_number: seat.row_number,
        position_in_row: seat.position_in_row,
        seat_type: seat.seat_type,
        status: assignment.status === "occupied" ? "occupied" : "available",
        display_name: assignment.guests?.full_name?.trim?.split(/\s+/)[0] ?? "Member",
        is_disabled: false,
        guest_id: assignment.guest_id,
        guest_name: assignment.guests?.full_name ?? null,
        assignment_id: assignment.id,
      };
    });

    const { data: guestRowsData, error: guestRowsError } = await supabase
      .from("guests")
      .select("*")
      .eq("event_id", event.id)
      .order("full_name", { ascending: true });

    if (guestRowsError) {
      return NextResponse.json({ ok: false, message: guestRowsError.message ?? "Unable to load guests." }, { status: 500 });
    }

    const guestRows = guestRowsData ?? [];

    const { data: paymentRowsData, error: paymentRowsLookupError } = await supabase
      .from("payments")
      .select("*, guests:guest_id(full_name, guest_code, id)")
      .eq("event_id", event.id)
      .eq("is_voided", false)
      .order("paid_at", { ascending: false });

    if (paymentRowsLookupError) {
      return NextResponse.json({ ok: false, message: paymentRowsLookupError.message ?? "Unable to load payments." }, { status: 500 });
    }

    const paymentRows = paymentRowsData ?? [];

    const eligibility = new Map<string, any>();
    const activeAssignments = new Map<string, any>();

    for (const assignment of assignments) {
      if (assignment.status === "occupied") {
        activeAssignments.set(assignment.guest_id, assignment);
      }
    }

    for (const guest of guestRows) {
      const guestPayments = paymentRows.filter((payment: any) => payment.guest_id === guest.id);
      const totalPaid = guestPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
      const latestPayment = guestPayments[0] ?? null;
      const activeSeat = activeAssignments.get(guest.id);
      const seatNumber = activeSeat?.bus_seats?.seat_number ?? null;

      eligibility.set(guest.id, {
        id: guest.id,
        guest_code: guest.guest_code,
        full_name: guest.full_name,
        total_paid: totalPaid,
        payment_id: latestPayment?.id ?? null,
        payment_code: latestPayment?.payment_code ?? null,
        public_payment_id: latestPayment?.public_payment_id ?? null,
        payment_amount: latestPayment?.amount ?? 0,
        payment_status: latestPayment ? "paid" : "unpaid",
        eligible: totalPaid >= SEAT_ELIGIBILITY_THRESHOLD,
        seat_assignment_status: activeSeat?.status ?? "available",
        seat_number: seatNumber,
      });
    }

    const eligibleGuests = Array.from(eligibility.values()).filter((guest: any) => guest.eligible).sort((a, b) => a.full_name.localeCompare(b.full_name));

    return NextResponse.json({ ok: true, event, bus, seats: seatRows, assignments: assignments ?? [], eligibleGuests });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat management unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile, permissions, isOwner } = await getCurrentAdmin();
    if (!authorizeAdmin(permissions, isOwner)) {
      return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body.action ?? "");
    const event = await getActiveEvent();
    if (!event) {
      return NextResponse.json({ ok: false, message: "No active event configured." }, { status: 404 });
    }

    const supabase = createAdminClient();

    if (action === "seat_selection") {
      const update: Record<string, any> = {};
      if (typeof body.seat_selection_open === "boolean") {
        update.seat_selection_open = body.seat_selection_open;
      }

      if (body.seat_selection_deadline === "" || body.seat_selection_deadline === null) {
        update.seat_selection_deadline = null;
      } else if (typeof body.seat_selection_deadline === "string") {
        const deadlineValue = body.seat_selection_deadline.trim();
        if (deadlineValue) {
          update.seat_selection_deadline = new Date(deadlineValue).toISOString();
        }
      }

      if (Object.keys(update).length === 0) {
        return NextResponse.json({ ok: false, message: "No event seat selection change sent." }, { status: 400 });
      }

      const { error } = await supabase
        .from("events")
        .update(update)
        .eq("id", event.id);

      if (error) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
      }

      return NextResponse.json({ ok: true, message: "Seat selection updated." });
    }

    if (action === "assign") {
      const guestId = String(body.guest_id ?? "");
      const seatId = String(body.seat_id ?? "");
      const paymentId = String(body.payment_id ?? "");

      if (!guestId || !seatId) {
        return NextResponse.json({ ok: false, message: "Choose a guest and a seat before assigning." }, { status: 400 });
      }

      const { data: bus } = await supabase
        .from("event_buses")
        .select("*")
        .eq("event_id", event.id)
        .eq("name", "Big Costa")
        .maybeSingle();

      if (!bus) {
        return NextResponse.json({ ok: false, message: "Big Costa bus not configured." }, { status: 404 });
      }

      const { data: seat, error: seatLookupError } = await supabase
        .from("bus_seats")
        .select("*")
        .eq("id", seatId)
        .eq("bus_id", bus.id)
        .maybeSingle();

      if (seatLookupError || !seat) {
        return NextResponse.json({ ok: false, message: "Selected seat could not be found." }, { status: 404 });
      }

      if (seat.is_disabled) {
        return NextResponse.json({ ok: false, message: "That seat is disabled and cannot be assigned." }, { status: 409 });
      }

      const { data: guest } = await supabase
        .from("guests")
        .select("*")
        .eq("id", guestId)
        .eq("event_id", event.id)
        .maybeSingle();

      if (!guest) {
        return NextResponse.json({ ok: false, message: "Guest could not be found for this event." }, { status: 404 });
      }

      const { data: paymentRowsData, error: paymentRowsError } = await supabase
        .from("payments")
        .select("*")
        .eq("event_id", event.id)
        .eq("guest_id", guest.id)
        .eq("is_voided", false)
        .order("paid_at", { ascending: false });

      if (paymentRowsError) {
        return NextResponse.json({ ok: false, message: paymentRowsError.message ?? "Unable to read guest payment history." }, { status: 500 });
      }

      const paymentRows = paymentRowsData ?? [];

      const totalPaid = paymentRows.reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
      if (totalPaid < SEAT_ELIGIBILITY_THRESHOLD) {
        return NextResponse.json({ ok: false, message: `Guest is not eligible. At least ₦5,000 total valid payment is required.`, needsPayment: true, totalPaid }, { status: 403 });
      }

      const selectedPayment = paymentRows.find((row: any) => row.id === paymentId) ?? paymentRows[0] ?? null;
      if (!selectedPayment) {
        return NextResponse.json({ ok: false, message: "Eligible payment record could not be found for this guest." }, { status: 404 });
      }

      const { data: existingGuestSeat } = await supabase
        .from("seat_assignments")
        .select("*, bus_seats:seat_id(seat_number)")
        .eq("event_id", event.id)
        .eq("guest_id", guest.id)
        .eq("status", "occupied")
        .maybeSingle();

      if (existingGuestSeat) {
        const guestSeatNumber = existingGuestSeat.bus_seats?.seat_number ?? "that seat";
        return NextResponse.json({ ok: false, message: `This member already has seat ${guestSeatNumber}.`, existingSeat: guestSeatNumber }, { status: 409 });
      }

      const { data: seatTaken } = await supabase
        .from("seat_assignments")
        .select("*, guests:guest_id(full_name)")
        .eq("event_id", event.id)
        .eq("bus_id", bus.id)
        .eq("seat_id", seat.id)
        .eq("status", "occupied")
        .maybeSingle();

      if (seatTaken) {
        return NextResponse.json({ ok: false, message: `Seat ${seat.seat_number} is no longer available.`, seatTaken: true }, { status: 409 });
      }

      const assignmentPayload = {
        event_id: event.id,
        bus_id: bus.id,
        seat_id: seat.id,
        guest_id: guest.id,
        payment_id: selectedPayment.id,
        status: "occupied",
        assigned_by: profile.id,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await supabase
        .from("seat_assignments")
        .insert(assignmentPayload)
        .select("*")
        .single();

      if (insertError || !inserted) {
        return NextResponse.json({ ok: false, message: insertError?.message ?? "Unable to assign seat. Please try again." }, { status: 409 });
      }

      return NextResponse.json({ ok: true, message: `Seat ${seat.seat_number} assigned.`, assignment: inserted });
    }

    if (action === "release") {
      const seatId = String(body.seat_id ?? "");
      if (!seatId) {
        return NextResponse.json({ ok: false, message: "Seat selection is missing." }, { status: 400 });
      }

      const { data: seat } = await supabase
        .from("bus_seats")
        .select("*")
        .eq("id", seatId)
        .eq("bus_id", (await supabase.from("event_buses").select("id").eq("event_id", event.id).eq("name", "Big Costa").maybeSingle()).data?.id ?? "")
        .maybeSingle();

      const { data: assignment } = await supabase
        .from("seat_assignments")
        .select("*, guests:guest_id(full_name), bus_seats:seat_id(seat_number)")
        .eq("event_id", event.id)
        .eq("status", "occupied")
        .eq("seat_id", seatId)
        .maybeSingle();

      if (!assignment) {
        return NextResponse.json({ ok: false, message: "No occupied seat assignment was found to release." }, { status: 404 });
      }

      const { error } = await supabase
        .from("seat_assignments")
        .update({ status: "released", updated_at: new Date().toISOString() })
        .eq("id", assignment.id)
        .eq("event_id", event.id);

      if (error) {
        return NextResponse.json({ ok: false, message: error.message ?? "Unable to release seat. Please try again." }, { status: 409 });
      }

      return NextResponse.json({ ok: true, message: `Seat ${assignment.bus_seats?.seat_number ?? seat?.seat_number ?? ""} released.`, assignment });
    }

    return NextResponse.json({ ok: false, message: "Unsupported admin seat action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat management failed." }, { status: 500 });
  }
}
