import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const paymentId = String(body.paymentId ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const seat = String(body.seat ?? "").trim().toUpperCase();

    if (!paymentId.startsWith("PAY-")) {
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("public_payment_id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return NextResponse.json({ ok: false, message: "Payment ID not found." }, { status: 404 });
    }

    if (payment.is_voided) {
      return NextResponse.json({ ok: false, message: "That payment is no longer valid." }, { status: 403 });
    }

    const { data: guest } = await supabase.from("guests").select("*").eq("id", payment.guest_id).single();
    const { data: event } = await supabase.from("events").select("*").eq("id", payment.event_id).single();
    const { data: finance } = await supabase.from("guest_financials").select("*").eq("guest_id", guest.id).eq("event_id", event.id).single();

    if (!guest || !event || !finance || finance.status !== "paid") {
      return NextResponse.json({ ok: false, message: "Payment is not eligible for seat selection." }, { status: 403 });
    }

    if (!event.seat_selection_open) {
      return NextResponse.json({ ok: false, message: "Seat selection is currently closed." }, { status: 403 });
    }

    if (event.seat_selection_deadline && new Date(event.seat_selection_deadline) < new Date()) {
      return NextResponse.json({ ok: false, message: "Seat selection deadline has passed." }, { status: 403 });
    }

    const { data: bus } = await supabase
      .from("event_buses")
      .select("*")
      .eq("event_id", event.id)
      .eq("name", "Big Costa")
      .maybeSingle();

    if (!bus) {
      return NextResponse.json({ ok: false, message: "Big Costa bus not configured for this event." }, { status: 404 });
    }

    const { data: busSeat, error: seatError } = await supabase
      .from("bus_seats")
      .select("*")
      .eq("bus_id", bus.id)
      .eq("seat_number", seat)
      .maybeSingle();

    if (seatError || !busSeat || busSeat.is_disabled) {
      return NextResponse.json({ ok: false, message: "Seat is unavailable or disabled." }, { status: 409 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("seat_assignments")
      .select("*")
      .eq("event_id", event.id)
      .eq("bus_id", bus.id)
      .eq("seat_id", busSeat.id)
      .maybeSingle();

    if (existing && existing.guest_id !== guest.id) {
      return NextResponse.json({ ok: false, message: `Seat ${busSeat.seat_number} has just been taken. Please choose another seat.` }, { status: 409 });
    }

    if (existing && existing.guest_id === guest.id) {
      return NextResponse.json({ ok: false, message: "You already selected that seat." }, { status: 200 });
    }

    const assignmentPayload = {
      event_id: event.id,
      bus_id: bus.id,
      seat_id: busSeat.id,
      guest_id: guest.id,
      payment_id: payment.id,
      status: "occupied",
      assigned_by: null,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabase
      .from("seat_assignments")
      .upsert(assignmentPayload, { onConflict: "event_id, bus_id, seat_id", ignoreDuplicates: false })
      .select("*")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ ok: false, message: "Seat could not be assigned." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, seat: busSeat.seat_number, message: "Seat confirmed." });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Seat selection failed." }, { status: 500 });
  }
}
