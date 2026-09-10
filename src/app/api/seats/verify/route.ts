import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePaymentId, SEAT_ELIGIBILITY_THRESHOLD } from "@/lib/seats";
import { NextResponse } from "next/server";

const FAILED_ATTEMPT_BUCKET = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const now = Date.now();
    const bucket = FAILED_ATTEMPT_BUCKET.get(ip);

    if (bucket && bucket.resetAt > now && bucket.count >= 8) {
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 429 });
    }

    const body = await request.json();
    const reference = normalizePaymentId(String(body.paymentId ?? ""));

    if (!reference.publicId) {
      const prior = FAILED_ATTEMPT_BUCKET.get(ip);
      if (!prior || prior.resetAt <= now) {
        FAILED_ATTEMPT_BUCKET.set(ip, { count: 1, resetAt: now + 60_000 });
      } else {
        prior.count += 1;
        prior.resetAt = now + 60_000;
      }
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)")
      .eq("public_payment_id", reference.publicId)
      .maybeSingle();

    if (paymentError || !payment) {
      const prior = FAILED_ATTEMPT_BUCKET.get(ip);
      if (!prior || prior.resetAt <= now) {
        FAILED_ATTEMPT_BUCKET.set(ip, { count: 1, resetAt: now + 60_000 });
      } else {
        prior.count += 1;
        prior.resetAt = now + 60_000;
      }
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 404 });
    }

    if (payment.is_voided) {
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 403 });
    }

    const guest = payment.guests;
    const event = payment.events;

    if (!guest || !event) {
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 404 });
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
        message: "Invalid payment ID.",
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

    // Clear the failed-attempt bucket on a valid public ID match.
    FAILED_ATTEMPT_BUCKET.delete(ip);

    return NextResponse.json({
      ok: true,
      event: { id: event.id, name: event.name, year: event.year, event_date: event.event_date },
      guest: { full_name: guest.full_name },
      payment: { public_payment_id: payment.public_payment_id },
      selectedSeat,
      totalPaid,
      eligible: true,
      seatSelectionOpen: event.seat_selection_open ?? false,
      deadline: event.seat_selection_deadline,
      canChangeSeats: event.allow_member_seat_changes ?? true,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 500 });
  }
}
