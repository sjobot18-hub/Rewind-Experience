import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizePaymentId,
  SEAT_ELIGIBILITY_THRESHOLD,
  getPermanentBigCostaBus,
} from "@/lib/seats";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonResponse(
  data: Record<string, any>,
  status = 200
) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const reference =
      normalizePaymentId(
        String(
          body.paymentId ??
            ""
        )
      );

    const seat = String(
      body.seat ?? ""
    )
      .trim()
      .toUpperCase();

    if (!reference.publicId && !reference.paymentCode) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Invalid payment ID.",
        },
        400
      );
    }

    if (!seat) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Please choose a seat.",
        },
        400
      );
    }

    const supabase =
      createAdminClient();

    /*
     * Verify the public payment credential.
     */
    const {
      data: payment,
      error: paymentError,
    } = await supabase
      .from("payments")
      .select(
        "*, guests:guest_id(*), events:event_id(*)"
      )
      .or(
        [
          reference.publicId
            ? `public_payment_id.ilike.${reference.publicId}`
            : "",
          reference.paymentCode
            ? `payment_code.ilike.${reference.paymentCode}`
            : "",
        ]
          .filter(Boolean)
          .join(",")
      )
      .maybeSingle();

    if (
      paymentError ||
      !payment
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Payment ID not found.",
        },
        404
      );
    }

    if (payment.is_voided) {
      return jsonResponse(
        {
          ok: false,
          message:
            "That payment is no longer valid.",
        },
        403
      );
    }

    const guest =
      payment.guests;

    const event =
      payment.events;

    if (
      !guest ||
      !event
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Payment record could not be linked to a guest or event.",
        },
        404
      );
    }

    /*
     * Calculate total valid payment for this
     * guest in this event.
     */
    const {
      data: payments,
      error: paymentsError,
    } = await supabase
      .from("payments")
      .select(
        "amount, is_voided"
      )
      .eq(
        "guest_id",
        guest.id
      )
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "is_voided",
        false
      );

    if (paymentsError) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Unable to verify payment eligibility.",
        },
        500
      );
    }

    const totalPaid =
      (payments ?? [])
        .reduce(
          (
            sum: number,
            row: any
          ) =>
            sum +
            Number(
              row?.amount ?? 0
            ),
          0
        );

    if (
      totalPaid <
      SEAT_ELIGIBILITY_THRESHOLD
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            `At least ₦5,000 total valid payment is required before seat selection. You have ₦${Math.round(
              totalPaid
            )}.`,
          needsPayment: true,
          totalPaid,
        },
        403
      );
    }

    /*
     * SEAT SELECTION MUST ACTUALLY BE OPEN.
     *
     * This reads directly from the database.
     * The admin Open button now persists this value.
     */
    if (
      !event.seat_selection_open
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Seat selection is currently closed.",
        },
        403
      );
    }

    /*
     * Enforce the configured deadline.
     */
    if (
      event.seat_selection_deadline
    ) {
      const deadline =
        new Date(
          event.seat_selection_deadline
        );

      if (
        !Number.isNaN(
          deadline.getTime()
        ) &&
        deadline.getTime() <
          Date.now()
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Seat selection deadline has passed.",
          },
          403
        );
      }
    }

    /*
     * Resolve the permanent physical Big Costa bus.
     *
     * This is the critical part of the permanent
     * seat architecture.
     */
    const bus =
      await getPermanentBigCostaBus(
        supabase
      );

    if (!bus) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Big Costa bus not configured for the permanent seat map.",
        },
        404
      );
    }

    if (bus.event_id !== event.id) {
      return jsonResponse(
        {
          ok: false,
          message: "Payment belongs to a different event.",
        },
        409
      );
    }

    /*
     * Find the requested seat ONLY inside
     * the permanent Big Costa bus.
     */
    const {
      data: busSeat,
      error: seatError,
    } = await supabase
      .from("bus_seats")
      .select("*")
      .eq(
        "bus_id",
        bus.id
      )
      .eq(
        "seat_number",
        seat
      )
      .maybeSingle();

    if (
      seatError ||
      !busSeat
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Seat is unavailable or does not exist.",
        },
        409
      );
    }

    if (busSeat.is_disabled) {
      return jsonResponse(
        {
          ok: false,
          message:
            `Seat ${busSeat.seat_number} is disabled.`,
        },
        409
      );
    }

    /*
     * Check whether this seat is already occupied
     * by another member on the permanent bus.
     */
    const {
      data: existingSeatAssignment,
      error:
        existingSeatError,
    } = await supabase
      .from("seat_assignments")
      .select("*")
      .eq(
        "bus_id",
        bus.id
      )
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "seat_id",
        busSeat.id
      )
      .eq(
        "status",
        "occupied"
      )
      .order(
        "updated_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (existingSeatError) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Unable to check seat availability.",
        },
        500
      );
    }

    if (
      existingSeatAssignment &&
      existingSeatAssignment.guest_id !==
        guest.id
    ) {
      return jsonResponse(
        {
          ok: false,
          message: `Seat ${busSeat.seat_number} has just been taken. Please choose another seat.`,
        },
        409
      );
    }

    /*
     * Find this guest's current occupied seat
     * on the permanent Big Costa bus.
     */
    const {
      data: priorAssignment,
      error:
        priorAssignmentError,
    } = await supabase
      .from("seat_assignments")
      .select("*")
      .eq(
        "guest_id",
        guest.id
      )
      .eq(
        "bus_id",
        bus.id
      )
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "status",
        "occupied"
      )
      .order(
        "updated_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (priorAssignmentError) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Unable to check your current seat assignment.",
        },
        500
      );
    }

    /*
     * If the member already has this exact seat,
     * there is nothing else to change.
     */
    if (
      priorAssignment &&
      priorAssignment.seat_id ===
        busSeat.id
    ) {
      return jsonResponse({
        ok: true,
        seat:
          busSeat.seat_number,
        message:
          "That seat is already assigned to you.",
      });
    }

    /*
     * If the member already has a different seat,
     * respect the event's seat-change setting.
     */
    if (
      priorAssignment &&
      priorAssignment.seat_id !==
        busSeat.id &&
      !event.allow_member_seat_changes
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Seat changes are not allowed for this event.",
        },
        403
      );
    }

    const now =
      new Date().toISOString();

    /*
     * Keep the current event on the assignment,
     * while the physical bus and seat remain permanent.
     */
    const assignmentPayload = {
      event_id: event.id,
      bus_id: bus.id,
      seat_id: busSeat.id,
      guest_id: guest.id,
      payment_id: payment.id,
      status: "occupied",
      assigned_by: null,
      assigned_at: now,
      updated_at: now,
    };

    /*
     * CHANGE AN EXISTING SEAT
     */
    if (priorAssignment) {
      const {
        error: updateError,
      } = await supabase
        .from("seat_assignments")
        .update({
          event_id: event.id,
          seat_id: busSeat.id,
          bus_id: bus.id,
          payment_id: payment.id,
          status: "occupied",
          updated_at: now,
        })
        .eq(
          "id",
          priorAssignment.id
        )
        .eq(
          "bus_id",
          bus.id
        );

      if (updateError) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Seat could not be changed.",
          },
          409
        );
      }

      return jsonResponse({
        ok: true,
        seat:
          busSeat.seat_number,
        message:
          "Seat changed.",
      });
    }

    /*
     * CREATE A NEW SEAT ASSIGNMENT
     */
    const {
      data: inserted,
      error: insertError,
    } = await supabase
      .from("seat_assignments")
      .insert(
        assignmentPayload
      )
      .select("*")
      .single();

    if (
      insertError ||
      !inserted
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            insertError?.message ??
            "Seat could not be assigned.",
        },
        409
      );
    }

    return jsonResponse({
      ok: true,
      seat:
        busSeat.seat_number,
      message:
        "Seat confirmed.",
    });
  } catch (error: any) {
    return jsonResponse(
      {
        ok: false,
        message:
          error?.message ??
          "Seat selection failed.",
      },
      500
    );
  }
}
