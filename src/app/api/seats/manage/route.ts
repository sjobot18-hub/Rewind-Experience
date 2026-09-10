import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getCurrentAdmin, can } from "@/lib/currentAdmin";
import {
  SEAT_ELIGIBILITY_THRESHOLD,
  getGuestFullName,
  getPermanentBigCostaBus,
} from "@/lib/seats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorizeAdmin(permissions: string[], isOwner: boolean) {
  return (
    isOwner ||
    can(permissions as any, isOwner, "manage_seats") ||
    can(permissions as any, isOwner, "manage_event_settings")
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

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();

    if (process.env.NODE_ENV !== "development") {
      const { permissions, isOwner } = await getCurrentAdmin();

      if (!authorizeAdmin(permissions, isOwner)) {
        return jsonResponse(
          {
            ok: false,
            message: "Forbidden.",
          },
          403
        );
      }
    }

    /*
     * BIG COSTA IS A PERMANENT PHYSICAL SEAT MAP.
     *
     * We deliberately do NOT use the requested event_id from the URL
     * to decide which bus or which seats to load.
     *
     * The permanent Big Costa bus determines the event whose seat
     * selection settings and member records are being managed.
     */
    const bus = await getPermanentBigCostaBus(supabase);

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

    const eventId = bus.event_id ?? null;

    let event: any = null;

    if (eventId) {
      const {
        data: eventRow,
        error: eventError,
      } = await supabase
        .from("events")
        .select(
          "id, name, year, event_date, seat_selection_open, seat_selection_deadline, allow_member_seat_changes"
        )
        .eq("id", eventId)
        .maybeSingle();

      if (eventError) {
        return jsonResponse(
          {
            ok: false,
            message:
              eventError.message ??
              "Unable to load event.",
          },
          500
        );
      }

      event = eventRow;
    }

    /*
     * LOAD THE PERMANENT 36-SEAT MAP.
     */
    const {
      data: seatsData,
      error: seatError,
    } = await supabase
      .from("bus_seats")
      .select("*")
      .eq("bus_id", bus.id)
      .order("row_number", {
        ascending: true,
      })
      .order("position_in_row", {
        ascending: true,
      });

    if (seatError) {
      return jsonResponse(
        {
          ok: false,
          message:
            seatError.message ??
            "Unable to load bus seats.",
        },
        500
      );
    }

    const seats = Array.isArray(seatsData)
      ? seatsData
      : [];

    /*
     * ONLY CURRENT OCCUPIED ASSIGNMENTS ARE SHOWN
     * AS OCCUPIED.
     *
     * Released assignments remain in the database for
     * history, but they no longer block a seat.
     */
    let assignmentQuery = supabase
      .from("seat_assignments")
      .select(
        "*, guests:guest_id(full_name, guest_code, id), payments:payment_id(payment_code, public_payment_id, amount, is_voided, id), bus_seats:seat_id(*)"
      )
      .eq("bus_id", bus.id)
      .eq("status", "occupied")
      .order("updated_at", {
        ascending: false,
      });

    if (eventId) {
      assignmentQuery =
        assignmentQuery.eq(
          "event_id",
          eventId
        );
    }

    const {
      data: assignmentRows,
      error: assignmentError,
    } = await assignmentQuery;

    if (assignmentError) {
      return jsonResponse(
        {
          ok: false,
          message:
            assignmentError.message ??
            "Unable to load seat assignments.",
        },
        500
      );
    }

    const assignments = Array.isArray(
      assignmentRows
    )
      ? assignmentRows
      : [];

    const assignmentBySeat = new Map<
      string,
      any
    >();

    for (const assignment of assignments) {
      if (
        assignment &&
        assignment.status === "occupied" &&
        assignment.seat_id
      ) {
        /*
         * Because results are ordered newest first,
         * keep the first active assignment for a seat.
         */
        const key = String(
          assignment.seat_id
        );

        if (!assignmentBySeat.has(key)) {
          assignmentBySeat.set(
            key,
            assignment
          );
        }
      }
    }

    const seatRows = seats.map(
      (seat: any) => {
        const assignment =
          assignmentBySeat.get(
            String(seat.id)
          );

        const isDisabled = Boolean(
          seat.is_disabled
        );

        if (isDisabled) {
          return {
            seat_id: seat.id,
            seat_number: seat.seat_number,
            row_number: seat.row_number,
            position_in_row:
              seat.position_in_row,
            seat_type: seat.seat_type,
            status: "disabled",
            display_name: "DISABLED",
            is_disabled: true,
            guest_id: null,
            guest_name: null,
            assignment_id: null,
          };
        }

        if (!assignment) {
          return {
            seat_id: seat.id,
            seat_number: seat.seat_number,
            row_number: seat.row_number,
            position_in_row:
              seat.position_in_row,
            seat_type: seat.seat_type,
            status: "available",
            display_name: "AVAILABLE",
            is_disabled: false,
            guest_id: null,
            guest_name: null,
            assignment_id: null,
          };
        }

        const guestName =
          getGuestFullName(
            assignment.guests
          );

        return {
          seat_id: seat.id,
          seat_number: seat.seat_number,
          row_number: seat.row_number,
          position_in_row:
            seat.position_in_row,
          seat_type: seat.seat_type,
          status: "occupied",
          display_name:
            guestName || "Member",
          is_disabled: false,
          guest_id:
            assignment.guest_id ?? null,
          guest_name:
            guestName || null,
          assignment_id:
            assignment.id ?? null,
        };
      }
    );

    /*
     * LOAD GUESTS FOR THE EVENT ASSOCIATED
     * WITH THE PERMANENT BIG COSTA BUS.
     */
    let guestQuery = supabase
      .from("guests")
      .select("*")
      .order("full_name", {
        ascending: true,
      });

    if (eventId) {
      guestQuery = guestQuery.eq(
        "event_id",
        eventId
      );
    }

    const {
      data: guestRowsData,
      error: guestRowsError,
    } = await guestQuery;

    if (guestRowsError) {
      return jsonResponse(
        {
          ok: false,
          message:
            guestRowsError.message ??
            "Unable to load guests.",
        },
        500
      );
    }

    const guestRows = Array.isArray(
      guestRowsData
    )
      ? guestRowsData
      : [];

    /*
     * LOAD PAYMENTS FOR THE SAME EVENT.
     *
     * This keeps admin eligibility consistent
     * with public verification.
     */
    let paymentQuery = supabase
      .from("payments")
      .select(
        "*, guests:guest_id(full_name, guest_code, id)"
      )
      .eq("is_voided", false)
      .order("paid_at", {
        ascending: false,
      });

    if (eventId) {
      paymentQuery = paymentQuery.eq(
        "event_id",
        eventId
      );
    }

    const {
      data: paymentRowsData,
      error: paymentRowsError,
    } = await paymentQuery;

    if (paymentRowsError) {
      return jsonResponse(
        {
          ok: false,
          message:
            paymentRowsError.message ??
            "Unable to load payments.",
        },
        500
      );
    }

    const paymentRows = Array.isArray(
      paymentRowsData
    )
      ? paymentRowsData
      : [];

    const eligibility = new Map<
      string,
      any
    >();

    const activeAssignments =
      new Map<string, any>();

    for (const assignment of assignments) {
      if (
        assignment &&
        assignment.status === "occupied" &&
        assignment.guest_id
      ) {
        activeAssignments.set(
          String(assignment.guest_id),
          assignment
        );
      }
    }

    for (const guest of guestRows) {
      if (!guest?.id) {
        continue;
      }

      const guestPayments =
        paymentRows.filter(
          (payment: any) =>
            payment &&
            payment.guest_id === guest.id &&
            payment.is_voided !== true
        );

      const totalPaid =
        guestPayments.reduce(
          (
            sum: number,
            payment: any
          ) => {
            const amount = Number(
              payment?.amount ?? 0
            );

            return (
              sum +
              (Number.isFinite(amount)
                ? amount
                : 0)
            );
          },
          0
        );

      const latestPayment =
        guestPayments[0] ?? null;

      const activeSeat =
        activeAssignments.get(
          String(guest.id)
        );

      const seatNumber =
        activeSeat?.bus_seats
          ?.seat_number ?? null;

      eligibility.set(
        String(guest.id),
        {
          id: guest.id,
          guest_code:
            guest.guest_code ?? null,
          full_name:
            getGuestFullName(
              guest.full_name
            ),
          total_paid: totalPaid,
          payment_id:
            latestPayment?.id ?? null,
          payment_code:
            latestPayment?.payment_code ??
            null,
          public_payment_id:
            latestPayment?.public_payment_id ??
            null,
          payment_amount:
            latestPayment?.amount ?? 0,
          payment_status:
            latestPayment
              ? "paid"
              : "unpaid",
          eligible:
            totalPaid >=
            SEAT_ELIGIBILITY_THRESHOLD,
          seat_assignment_status:
            activeSeat?.status ??
            "available",
          seat_number: seatNumber,
        }
      );
    }

    const eligibleGuests =
      Array.from(
        eligibility.values()
      )
        .filter(
          (guest: any) =>
            guest.eligible
        )
        .sort((a, b) =>
          String(
            a.full_name ?? ""
          ).localeCompare(
            String(
              b.full_name ?? ""
            )
          )
        );

    return jsonResponse({
      ok: true,
      event,
      bus,
      seats: seatRows,
      assignments,
      eligibleGuests,
    });
  } catch (error: any) {
    return jsonResponse(
      {
        ok: false,
        message:
          error?.message ??
          "Seat management unavailable.",
      },
      500
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const {
      profile,
      permissions,
      isOwner,
    } = await getCurrentAdmin();

    if (
      !authorizeAdmin(
        permissions,
        isOwner
      )
    ) {
      return jsonResponse(
        {
          ok: false,
          message: "Forbidden.",
        },
        403
      );
    }

    const body = await request.json();
    const action = String(
      body.action ?? ""
    ).trim();

    const supabase =
      createAdminClient();

    /*
     * Resolve the permanent Big Costa bus
     * once for every seat-management action.
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

    const permanentEventId =
      bus.event_id ?? null;

    /*
     * OPEN / CLOSE MEMBER SEAT SELECTION
     *
     * IMPORTANT:
     * The old implementation created an update object
     * but never wrote it to Supabase.
     *
     * This version deliberately uses the event attached
     * to the permanent Big Costa bus instead of trusting
     * a possibly stale event_id from the browser.
     */
    if (
      action ===
      "seat_selection"
    ) {
      if (!permanentEventId) {
        return jsonResponse(
          {
            ok: false,
            message:
              "The permanent Big Costa bus is not linked to an event.",
          },
          409
        );
      }

      const update: Record<
        string,
        any
      > = {};

      if (
        typeof body.seat_selection_open ===
        "boolean"
      ) {
        update.seat_selection_open =
          body.seat_selection_open;
      }

      if (
        body.seat_selection_deadline ===
          "" ||
        body.seat_selection_deadline ===
          null ||
        typeof body.seat_selection_deadline ===
          "undefined"
      ) {
        /*
         * Only clear the deadline when the caller
         * explicitly sends null or an empty string.
         *
         * When no deadline field is sent, leave it alone.
         */
        if (
          body.seat_selection_deadline ===
            "" ||
          body.seat_selection_deadline ===
            null
        ) {
          update.seat_selection_deadline =
            null;
        }
      } else if (
        typeof body.seat_selection_deadline ===
        "string"
      ) {
        const deadlineValue =
          body.seat_selection_deadline.trim();

        if (deadlineValue) {
          const deadlineDate =
            new Date(deadlineValue);

          if (
            Number.isNaN(
              deadlineDate.getTime()
            )
          ) {
            return jsonResponse(
              {
                ok: false,
                message:
                  "Invalid seat selection deadline.",
              },
              400
            );
          }

          update.seat_selection_deadline =
            deadlineDate.toISOString();
        }
      }

      if (
        Object.keys(update)
          .length === 0
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              "No event seat selection change sent.",
          },
          400
        );
      }

      const {
        data: updatedEvent,
        error: updateError,
      } = await supabase
        .from("events")
        .update(update)
        .eq(
          "id",
          permanentEventId
        )
        .select(
          "id, name, year, event_date, seat_selection_open, seat_selection_deadline, allow_member_seat_changes"
        )
        .single();

      if (
        updateError ||
        !updatedEvent
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              updateError?.message ??
              "Unable to update event seat selection.",
          },
          409
        );
      }

      return jsonResponse({
        ok: true,
        message:
          updatedEvent.seat_selection_open
            ? "Seat selection is now open."
            : "Seat selection is now closed.",
        event: updatedEvent,
      });
    }

    /*
     * MANUAL ADMIN ASSIGNMENT
     */
    if (action === "assign") {
      const guestId = String(
        body.guest_id ?? ""
      ).trim();

      const seatId = String(
        body.seat_id ?? ""
      ).trim();

      const paymentId = String(
        body.payment_id ?? ""
      ).trim();

      if (!guestId || !seatId) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Choose a guest and a seat before assigning.",
          },
          400
        );
      }

      const {
        data: seat,
        error: seatLookupError,
      } = await supabase
        .from("bus_seats")
        .select("*")
        .eq("id", seatId)
        .eq("bus_id", bus.id)
        .maybeSingle();

      if (
        seatLookupError ||
        !seat
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Selected seat could not be found.",
          },
          404
        );
      }

      if (seat.is_disabled) {
        return jsonResponse(
          {
            ok: false,
            message:
              "That seat is disabled and cannot be assigned.",
          },
          409
        );
      }

      const {
        data: guest,
        error: guestError,
      } = await supabase
        .from("guests")
        .select("*")
        .eq("id", guestId)
        .maybeSingle();

      if (
        guestError ||
        !guest
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Guest could not be found.",
          },
          404
        );
      }

      if (
        permanentEventId &&
        guest.event_id &&
        guest.event_id !==
          permanentEventId
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Guest does not belong to the event currently attached to Big Costa.",
          },
          409
        );
      }

      /*
       * Load this guest's valid payments
       * for the same event.
       */
      let paymentQuery =
        supabase
          .from("payments")
          .select("*")
          .eq(
            "guest_id",
            guest.id
          )
          .eq(
            "is_voided",
            false
          )
          .order("paid_at", {
            ascending: false,
          });

      if (permanentEventId) {
        paymentQuery =
          paymentQuery.eq(
            "event_id",
            permanentEventId
          );
      }

      const {
        data: paymentRowsData,
        error: paymentRowsError,
      } = await paymentQuery;

      if (paymentRowsError) {
        return jsonResponse(
          {
            ok: false,
            message:
              paymentRowsError.message ??
              "Unable to read guest payment history.",
          },
          500
        );
      }

      const paymentRows =
        Array.isArray(
          paymentRowsData
        )
          ? paymentRowsData
          : [];

      const totalPaid =
        paymentRows.reduce(
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
              "Guest is not eligible. At least ₦5,000 total valid payment is required.",
            needsPayment: true,
            totalPaid,
          },
          403
        );
      }

      const selectedPayment =
        paymentRows.find(
          (row: any) =>
            row.id ===
            paymentId
        ) ??
        paymentRows[0] ??
        null;

      if (!selectedPayment) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Eligible payment record could not be found for this guest.",
          },
          404
        );
      }

      /*
       * A member can have only one currently
       * occupied seat on the permanent Big Costa bus.
       */
      const {
        data: existingGuestSeat,
        error:
          existingGuestSeatError,
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
          "status",
          "occupied"
        )
        .maybeSingle();

      if (
        existingGuestSeatError
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              existingGuestSeatError.message ??
              "Unable to check the guest's existing seat.",
          },
          500
        );
      }

      if (existingGuestSeat) {
        const guestSeatNumber =
          existingGuestSeat
            .bus_seats
            ?.seat_number ??
          "that seat";

        return jsonResponse(
          {
            ok: false,
            message: `This member already has seat ${guestSeatNumber}.`,
            existingSeat:
              guestSeatNumber,
          },
          409
        );
      }

      /*
       * Make sure another member has not already
       * taken this permanent seat.
       */
      const {
        data: seatTaken,
        error:
          seatTakenError,
      } = await supabase
        .from("seat_assignments")
        .select(
          "*, guests:guest_id(full_name)"
        )
        .eq(
          "bus_id",
          bus.id
        )
        .eq(
          "seat_id",
          seat.id
        )
        .eq(
          "status",
          "occupied"
        )
        .maybeSingle();

      if (seatTakenError) {
        return jsonResponse(
          {
            ok: false,
            message:
              seatTakenError.message ??
              "Unable to check seat availability.",
          },
          500
        );
      }

      if (seatTaken) {
        return jsonResponse(
          {
            ok: false,
            message: `Seat ${seat.seat_number} is no longer available.`,
            seatTaken: true,
          },
          409
        );
      }

      const now =
        new Date().toISOString();

      const assignmentPayload = {
        event_id:
          permanentEventId ??
          selectedPayment.event_id ??
          guest.event_id ??
          null,
        bus_id: bus.id,
        seat_id: seat.id,
        guest_id: guest.id,
        payment_id:
          selectedPayment.id,
        status: "occupied",
        assigned_by:
          profile.id,
        assigned_at: now,
        updated_at: now,
      };

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
              "Unable to assign seat. Please try again.",
          },
          409
        );
      }

      return jsonResponse({
        ok: true,
        message: `Seat ${seat.seat_number} assigned.`,
        assignment: inserted,
      });
    }

    /*
     * RELEASE ONE SEAT
     */
    if (action === "release") {
      const seatId = String(
        body.seat_id ?? ""
      ).trim();

      if (!seatId) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Seat selection is missing.",
          },
          400
        );
      }

      const {
        data: seat,
        error: seatError,
      } = await supabase
        .from("bus_seats")
        .select("*")
        .eq("id", seatId)
        .eq("bus_id", bus.id)
        .maybeSingle();

      if (
        seatError ||
        !seat
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Selected seat could not be found.",
          },
          404
        );
      }

      /*
       * Release the currently occupied assignment
       * for this permanent Big Costa seat.
       *
       * Do NOT require event_id from the browser.
       */
      const {
        data: assignment,
        error:
          assignmentLookupError,
      } = await supabase
        .from("seat_assignments")
        .select(
          "*, guests:guest_id(full_name), bus_seats:seat_id(seat_number)"
        )
        .eq(
          "bus_id",
          bus.id
        )
        .eq(
          "seat_id",
          seatId
        )
        .eq(
          "status",
          "occupied"
        )
        .order("updated_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (
        assignmentLookupError
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              assignmentLookupError.message ??
              "Unable to find the seat assignment.",
          },
          500
        );
      }

      if (!assignment) {
        return jsonResponse(
          {
            ok: false,
            message:
              "No occupied seat assignment was found to release.",
          },
          404
        );
      }

      const {
        error: releaseError,
      } = await supabase
        .from("seat_assignments")
        .update({
          status: "released",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          assignment.id
        )
        .eq(
          "bus_id",
          bus.id
        );

      if (releaseError) {
        return jsonResponse(
          {
            ok: false,
            message:
              releaseError.message ??
              "Unable to release seat. Please try again.",
          },
          409
        );
      }

      return jsonResponse({
        ok: true,
        message: `Seat ${
          assignment.bus_seats
            ?.seat_number ??
          seat.seat_number
        } released.`,
        assignment,
      });
    }

    /*
     * RESET ALL PERMANENT BIG COSTA ASSIGNMENTS
     *
     * This releases every currently occupied assignment
     * on the permanent Big Costa bus.
     *
     * Guests and payments are untouched.
     */
    if (
      action ===
      "reset_all_seats"
    ) {
      const {
        data: occupiedAssignments,
        error:
          occupiedLookupError,
      } = await supabase
        .from("seat_assignments")
        .select("id")
        .eq(
          "bus_id",
          bus.id
        )
        .eq(
          "status",
          "occupied"
        );

      if (
        occupiedLookupError
      ) {
        return jsonResponse(
          {
            ok: false,
            message:
              occupiedLookupError.message ??
              "Unable to inspect current seat assignments.",
          },
          500
        );
      }

      const releasedCount =
        Array.isArray(
          occupiedAssignments
        )
          ? occupiedAssignments.length
          : 0;

      if (releasedCount > 0) {
        const {
          error: resetError,
        } = await supabase
          .from("seat_assignments")
          .update({
            status: "released",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "bus_id",
            bus.id
          )
          .eq(
            "status",
            "occupied"
          );

        if (resetError) {
          return jsonResponse(
            {
              ok: false,
              message:
                resetError.message ??
                "Unable to reset all seats.",
            },
            409
          );
        }
      }

      return jsonResponse({
        ok: true,
        message:
          "All Big Costa seat assignments have been released.",
        releasedCount,
      });
    }

    return jsonResponse(
      {
        ok: false,
        message:
          "Unsupported admin seat action.",
      },
      400
    );
  } catch (error: any) {
    return jsonResponse(
      {
        ok: false,
        message:
          error?.message ??
          "Seat management failed.",
      },
      500
    );
  }
}