import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function normalizePaymentId(input: string) {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return cleaned.replace(/^PAY\-?2026\-?/, "PAY-");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const paymentId = normalizePaymentId(String(body.paymentId ?? ""));

    if (!paymentId || !paymentId.startsWith("PAY-")) {
      return NextResponse.json({ ok: false, message: "Enter a valid Payment ID." }, { status: 400 });
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

    const { data: finance } = await supabase
      .from("guest_financials")
      .select("*")
      .eq("guest_id", guest.id)
      .eq("event_id", event.id)
      .single();

    if (!finance || finance.status !== "paid") {
      return NextResponse.json({ ok: false, message: "Payment is not currently fully paid." }, { status: 403 });
    }

    const { data: assignment } = await supabase
      .from("seat_assignments")
      .select("*, bus_seats(*)")
      .eq("guest_id", guest.id)
      .eq("event_id", event.id)
      .maybeSingle();

    const selectedSeat = assignment?.bus_seats?.seat_number ?? null;

    return NextResponse.json({
      ok: true,
      event: { id: event.id, name: event.name, year: event.year, event_date: event.event_date },
      guest: { id: guest.id, full_name: guest.full_name, guest_code: guest.guest_code },
      payment: { public_payment_id: payment.public_payment_id, payment_code: payment.payment_code, amount: payment.amount, paid_at: payment.paid_at },
      selectedSeat,
      seatSelectionOpen: event.seat_selection_open ?? false,
      deadline: event.seat_selection_deadline,
      canChangeSeats: event.allow_member_seat_changes ?? true,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message ?? "Payment verification failed." }, { status: 500 });
  }
}
