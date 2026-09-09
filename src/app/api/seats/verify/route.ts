import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePaymentId, SEAT_ELIGIBILITY_THRESHOLD } from "@/lib/seats";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reference = normalizePaymentId(String(body.paymentId ?? ""));

    if (!reference.code && !reference.publicId) {
      return NextResponse.json({ ok: false, message: "Enter a valid Payment ID." }, { status: 400 });
    }

    const supabase = createAdminClient();

    let paymentQuery = supabase
      .from("payments")
      .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)");

    if (reference.publicId) {
      paymentQuery = paymentQuery.eq("public_payment_id", reference.publicId);
    } else {
      paymentQuery = paymentQuery.eq("payment_code", reference.code);
    }

    const { data: payment, error: paymentError } = await paymentQuery.maybeSingle();

    if (paymentError || !payment) {
      return NextResponse.json({ ok: false, message: "Payment ID not found." }, { status: 404 });
    }

    if (payment.is_voided) {
      return NextResponse.json({ ok: false, message: "That Payment ID is no longer valid." }, { status: 403 });
    }

    const guest = payment.guests;
    const event = payment.events;

    if (!guest || !event) {
      return NextResponse.json({ ok: false, message: "Payment record could not be linked to a guest or event." }, { status: 404 });
    }

    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount, is_voided")
      .eq("guest_id", guest.id)
      .eq("event_id", event.id)
      .eq("is_voided", false);

    const totalPaid = (payments ?? []).reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);

    if (paymentsError || totalPaid < SEAT_ELIGIBILITY_THRESHOLD) {
      return NextResponse.json({
        ok: false,
        message: `At least ₦5,000 total valid payment is required before seat selection. You have ₦${Math.round(totalPaid)}.`,
        needsPayment: true,
        totalPaid
      }, { status: 403 });
    }

    const { data: assignment } = await supabase
      .from("seat_assignments")
      .select("*, bus_seats(*)")
      .eq("guest_id", guest.id)
      .eq("event_id", event.id)
      .eq("status", "occupied")
      .maybeSingle();

    const selectedSeat = assignment?.bus_seats?.seat_number ?? null;

    return NextResponse.json({
      ok: true,
      event: { id: event.id, name: event.name, year: event.year, event_date: event.event_date },
      guest: { full_name: guest.full_name },
      payment: { public_payment_id: payment.public_payment_id, payment_code: payment.payment_code },
      selectedSeat,
      totalPaid,
      eligible: true,
      seatSelectionOpen: event.seat_selection_open ?? false,
      deadline: event.seat_selection_deadline,
      canChangeSeats: event.allow_member_seat_changes ?? true,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Payment verification failed." }, { status: 500 });
  }
}
