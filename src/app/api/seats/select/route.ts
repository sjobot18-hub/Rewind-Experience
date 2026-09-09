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

  const code = cleaned.replace(/-/g, "");
  const publicId = cleaned.startsWith("PAY-") ? cleaned : "";
  return { code: code.startsWith("PAY") ? code : "", publicId };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reference = normalizePaymentReference(String(body.paymentId ?? ""));
    const seat = String(body.seat ?? "").trim().toUpperCase();

    if (!reference.code && !reference.publicId) {
      return NextResponse.json({ ok: false, message: "Invalid payment ID." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const lookup = await (async () => {
      if (reference.publicId) {
        const { data, error } = await supabase.from("payments").select("*").eq("public_payment_id", reference.publicId).maybeSingle();
        if (!error && data) return data;
      }
      if (reference.code) {
        const { data, error } = await supabase.from("payments").select("*").eq("payment_code", reference.code).maybeSingle();
        if (!error && data) return data;
      }
      return null;
    })();

    const payment = lookup;
    if (!payment) {
      return NextResponse.json({ ok: false, message: "Payment ID not found." }, { status: 404 });
    }

    if (payment.is_voided) {
      return NextResponse.json({ ok: false, message: "That payment is no longer valid." }, { status: 403 });
    }

    const { data: guest } = await supabase.from("guests").select("*").eq("id", payment.guest_id).single();
    const { data: event } = await supabase.from("events").select("*").eq("id", payment.event_id).single();

    if (!guest || !event) {
      return NextResponse.json({ ok: false, message: "Payment record could not be linked to a guest or event." }, { status: 404 });
    }

    const { data: payments } = await supabase
      .from("payments")
      .select("amount, is_voided")
      .eq("guest_id", guest.id)
      .eq("event_id", event.id)
      .eq("is_voided", false);

    const totalPaid = (payments ?? []).reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);

    if (totalPaid < SEAT_ELIGIBILITY_THRESHOLD) {
      return NextResponse.json({ ok: false, message: `At least ₦5,000 total valid payment is required before seat selection. You have ₦${Math.round(totalPaid)}.`, needsPayment: true, totalPaid }, { status: 403 });
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

    const { data: existing } = await supabase
      .from("seat_assignments")
      .select("*")
      .eq("event_id", event.id)
      .eq("bus_id", bus.id)
      .eq("seat_id", busSeat.id)
      .eq("status", "occupied")
      .maybeSingle();

    if (existing && existing.guest_id !== guest.id) {
      return NextResponse.json({ ok: false, message: `Seat ${busSeat.seat_number} has just been taken. Please choose another seat.` }, { status: 409 });
    }

    const { data: priorAssignment } = await supabase
      .from("seat_assignments")
      .select("*")
      .eq("event_id", event.id)
      .eq("guest_id", guest.id)
      .eq("status", "occupied")
      .maybeSingle();

    if (priorAssignment && priorAssignment.seat_id !== busSeat.id && !event.allow_member_seat_changes) {
      return NextResponse.json({ ok: false, message: "Seat changes are not allowed for this event." }, { status: 403 });
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

    if (priorAssignment) {
      const { error: updateError } = await supabase
        .from("seat_assignments")
        .update({
          seat_id: busSeat.id,
          bus_id: bus.id,
          payment_id: payment.id,
          status: "occupied",
          updated_at: new Date().toISOString(),
        })
        .eq("id", priorAssignment.id);

      if (updateError) {
        return NextResponse.json({ ok: false, message: "Seat could not be changed." }, { status: 409 });
      }

      return NextResponse.json({ ok: true, seat: busSeat.seat_number, message: "Seat changed." });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("seat_assignments")
      .insert(assignmentPayload)
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
