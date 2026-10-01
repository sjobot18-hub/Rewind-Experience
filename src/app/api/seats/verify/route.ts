import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizePaymentId,
  SEAT_ELIGIBILITY_THRESHOLD,
  getPermanentBigCostaBus,
  getSmallCostaBus,
} from "@/lib/seats";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FAILED_ATTEMPT_BUCKET =
  new Map<
    string,
    {
      count: number;
      resetAt: number;
    }
  >();

function getClientIp(
  request: Request
) {
  const forwarded =
    request.headers.get(
      "x-forwarded-for"
    ) ??
    request.headers.get(
      "x-real-ip"
    ) ??
    "";

  return (
    forwarded
      .split(",")[0]
      ?.trim() ||
    "local"
  );
}

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

function recordFailedAttempt(
  ip: string,
  now: number
) {
  const prior =
    FAILED_ATTEMPT_BUCKET.get(
      ip
    );

  if (
    !prior ||
    prior.resetAt <= now
  ) {
    FAILED_ATTEMPT_BUCKET.set(
      ip,
      {
        count: 1,
        resetAt:
          now + 60_000,
      }
    );

    return;
  }

  prior.count += 1;
  prior.resetAt =
    now + 60_000;
}

export async function POST(
  request: Request
) {
  try {
    const ip =
      getClientIp(request);

    const now =
      Date.now();

    const bucket =
      FAILED_ATTEMPT_BUCKET.get(
        ip
      );

    if (
      bucket &&
      bucket.resetAt > now &&
      bucket.count >= 8
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Invalid payment ID.",
        },
        429
      );
    }

    const body =
      await request.json();

    const reference =
      normalizePaymentId(
        String(
          body.paymentId ??
            ""
        )
      );

    /*
     * SMALL COSTA IS AN OPTIONAL SECOND BUS.
     *
     * The default stays "Big Costa" so the
     * existing public portal keeps its exact
     * behaviour. The frontend never supplies a
     * bus id; it only asks for the Small Costa
     * view and the server resolves the row.
     */
    const busName =
      String(
        body.bus ??
          ""
      )
        .trim() ||
      "Big Costa";

    const isSmallCosta =
      busName === "Small Costa";

    if (!reference.publicId && !reference.paymentCode) {
      recordFailedAttempt(
        ip,
        now
      );

      return jsonResponse(
        {
          ok: false,
          message:
            "Invalid payment ID.",
        },
        400
      );
    }

    const supabase =
      createAdminClient();

    /*
     * The public credential is ONLY the public
     * PAY-xxxxxx identifier.
     */
    const {
      data: payment,
      error: paymentError,
    } = await supabase
      .from("payments")
      .select(
        "*, guests:guest_id(full_name, guest_code, id), events:event_id(id, name, year, event_date, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)"
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
      recordFailedAttempt(
        ip,
        now
      );

      return jsonResponse(
        {
          ok: false,
          message:
            "Invalid payment ID.",
        },
        404
      );
    }

    if (payment.is_voided) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Invalid payment ID.",
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
            "Invalid payment ID.",
        },
        404
      );
    }

    /*
     * Calculate all valid payments for this guest
     * in the same event.
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
            "Invalid payment ID.",
          needsPayment: true,
          totalPaid,
        },
        403
      );
    }

    /*
     * Find the permanent Big Costa bus.
     *
     * Seat occupancy is tied to this physical bus,
     * not to a newly-created event seat map.
     *
     * Small Costa is resolved explicitly by
     * event_id + name, never by seat count and
     * never by "the first bus returned".
     */
    const bus =
      isSmallCosta
        ? await getSmallCostaBus(
            supabase,
            event.id
          )
        : await getPermanentBigCostaBus(
            supabase
          );

    if (!bus) {
      return jsonResponse(
        {
          ok: false,
          message:
            isSmallCosta
              ? "Small Costa bus is not configured for this event."
              : "Big Costa bus is not configured for the permanent seat map.",
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
     * Find the guest's currently occupied seat
     * on the resolved bus.
     *
     * We deliberately do NOT depend on event_id here.
     * This prevents a stale event relationship from
     * hiding an existing permanent seat assignment.
     */
    const {
      data: assignment,
      error: assignmentError,
    } = await supabase
      .from("seat_assignments")
      .select(
        "*, bus_seats:seat_id(seat_number)"
      )
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

    if (assignmentError) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Unable to load the current seat assignment.",
        },
        500
      );
    }

    const selectedSeat =
      assignment
        ?.bus_seats
        ?.seat_number ??
      null;

    /*
     * A member may hold a seat on ONE Costa bus
     * only. When the requested bus is not the bus
     * the member already sits on, report the seat
     * they hold so the portal can block selection.
     */
    let hasSeatOnOtherBus = false;
    let otherBusSeat: string | null = null;

    if (isSmallCosta) {
      const {
        data: otherAssignments,
        error: otherAssignmentsError,
      } = await supabase
        .from("seat_assignments")
        .select(
          "*, bus_seats:seat_id(seat_number)"
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
          "status",
          "occupied"
        )
        .neq(
          "bus_id",
          bus.id
        )
        .order(
          "updated_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

      if (otherAssignmentsError) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Unable to load the current seat assignment.",
          },
          500
        );
      }

      if (otherAssignments) {
        hasSeatOnOtherBus = true;
        otherBusSeat =
          otherAssignments
            ?.bus_seats
            ?.seat_number ??
          null;
      }
    }

    /*
     * A valid public ID should no longer
     * count as a failed attempt.
     */
    FAILED_ATTEMPT_BUCKET.delete(
      ip
    );

    return jsonResponse({
      ok: true,

      event: {
        id: event.id,
        name: event.name,
        year: event.year,
        event_date:
          event.event_date,
      },

      guest: {
        full_name:
          guest.full_name,
      },

      payment: {
        public_payment_id:
          payment.public_payment_id,
      },

      selectedSeat,

      hasSeatOnOtherBus,

      otherBusSeat,

      totalPaid,

      eligible: true,

      seatSelectionOpen:
        Boolean(
          event.seat_selection_open
        ),

      deadline:
        event.seat_selection_deadline ??
        null,

      canChangeSeats:
        event.allow_member_seat_changes ??
        true,

      bus_id: bus.id,
    });
  } catch (error: any) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Invalid payment ID.",
      },
      500
    );
  }
}
