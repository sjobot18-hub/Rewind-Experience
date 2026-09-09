import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const SEAT_ELIGIBILITY_THRESHOLD = 5000;

function normalizePaymentReference(input: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  if (!cleaned || !cleaned.startsWith("PAY")) {
    return { code: "", publicId: "" };
  }

  // Accept PAY0004 shown on receipts.
  const code = cleaned.replace(/-/g, "");
  const codeLike = code.startsWith("PAY") ? code : "";

  // Also support the existing public Payment ID form on migrations: PAY-2026-00004.
  const publicId = cleaned.startsWith("PAY-") ? cleaned : "";

  return { code: codeLike, publicId };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reference = normalizePaymentReference(String(body.paymentId ?? ""));

    if (!reference.code && !reference.publicId) {
      return NextResponse.json({ ok: false, message: "Enter a valid Payment ID." }, { status: 400 });
    }

    const supabase = createAdminClient();

    let paymentQuery = supabase
      .from("payments")
      .select("*")
      .or(`payment_code.eq.${reference.code},public_payment_id.eq.${reference.publicId}`);

    if (!reference.publicId) {
      paymentQuery = supabase.from("payments").select("*").eq("payment_code", reference.code);
    }

    if (!reference.code) {
      paymentQuery = supabase.from("payments").select("*").eq("public_payment_id", reference.publicId);
    }

    const { data: payment, error: paymentError } = await paymentQuery.maybeSingle();

    if (paymentError || !payment) {
      return NextResponse.json({ ok: false, message: "Payment ID not found." }, { status: 404 });
    }

    if (payment.is_voided) {
      return NextResponse.json({ ok: false, message: "That Payment ID is no longer valid." }, { status: 403 });
    }

    const { data: guest } = await supabase
      .from("guests")
      .select("*")
      .eq("id", payment.guest_id)
      .single();

    const { data: event } = await supabase
      .from("events")
      .select("*")
      .eq("id", payment.event_id)
      .single();

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
      guest: { id: guest.id, full_name: guest.full_name, guest_code: guest.guest_code },
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
