import { createAdminClient } from "@/lib/supabase/admin";

export const SEAT_ELIGIBILITY_THRESHOLD = 5000;

export async function getPermanentBigCostaBus(supabase: ReturnType<typeof createAdminClient>) {
  const { data: busRows, error: busRowsError } = await supabase
    .from("event_buses")
    .select("*")
    .eq("name", "Big Costa")
    .order("created_at", { ascending: true });

  if (busRowsError) {
    throw new Error(busRowsError.message ?? "Unable to inspect Big Costa buses.");
  }

  const rows = Array.isArray(busRows) ? busRows : [];
  if (rows.length === 0) {
    return null;
  }

  const scored = [] as Array<{ bus: any; seatCount: number }>;
  for (const bus of rows) {
    const { data: seats, error: seatCountError } = await supabase
      .from("bus_seats")
      .select("id")
      .eq("bus_id", bus.id);

    if (!seatCountError) {
      scored.push({ bus, seatCount: Array.isArray(seats) ? seats.length : 0 });
    }
  }

  const permanent = scored
    .filter((entry) => entry.seatCount === 36)
    .sort((a, b) => b.seatCount - a.seatCount)[0];

  if (permanent?.bus) {
    return permanent.bus;
  }

  const explicitlyPermanent = rows.find((bus: any) => bus?.is_permanent === true) ?? null;
  if (explicitlyPermanent) {
    return explicitlyPermanent;
  }

  return rows[0] ?? null;
}

export async function getBusByName(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string | null | undefined,
  busName: string
) {
  if (!eventId) return null;

  const { data, error } = await supabase
    .from("event_buses")
    .select("*")
    .eq("event_id", eventId)
    .eq("name", busName)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? `Unable to resolve ${busName} bus.`);
  }

  return (data as any) ?? null;
}

export async function getSmallCostaBus(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string | null | undefined
) {
  return getBusByName(supabase, eventId, "Small Costa");
}

export async function getActiveEventId(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("is_currently_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return (data as any).id;
}

export async function getSeatNumberById(
  supabase: ReturnType<typeof createAdminClient>,
  seatId: string
) {
  const { data, error } = await supabase
    .from("bus_seats")
    .select("seat_number")
    .eq("id", seatId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as any).seat_number ?? null;
}

/*
 * SEAT POSITION LABELS ARE DERIVED FROM THE BUS
 * WIDTH, NOT HARDCODED TO BIG COSTA.
 *
 * seatsPerRow comes from the bus row itself
 * (event_buses.seats_per_row), so a 3-wide bus
 * labels its ends as windows while the 5-wide
 * Big Costa keeps exactly the labels it had:
 *
 *   5-wide -> 1,5 Window | 3 Aisle | 2,4 Middle
 *   3-wide -> 1,3 Window | 2 Aisle
 */
export function positionLabel(
  position: number | null | undefined,
  seatsPerRow: number | null | undefined = 5
): "Window" | "Middle" | "Aisle" | "" {
  if (position === undefined || position === null) return "";

  const seats = Number(seatsPerRow);
  if (!Number.isFinite(seats) || seats < 2) return "";
  if (position < 1 || position > seats) return "";

  /* The two ends of any row are window seats. */
  if (position === 1 || position === seats) return "Window";

  /* An odd-width row has a single centre aisle seat. */
  if (seats % 2 === 1 && position === Math.ceil(seats / 2)) return "Aisle";

  return "Middle";
}

export interface SeatRowData {
  row_number: number;
  seats: any[];
}

export interface SeatLayout {
  frontSeat: any | null;
  rows: SeatRowData[];
}

export function organizeSeatMap(seats: any[]): SeatLayout {
  const frontSeat = seats.find((s: any) => s.row_number === 0) ?? null;
  const passengerSeats = seats.filter((s: any) => s.row_number !== 0);

  const rowsMap = new Map<number, any[]>();
  for (const seat of passengerSeats) {
    const row = seat.row_number;
    if (!rowsMap.has(row)) {
      rowsMap.set(row, []);
    }
    rowsMap.get(row)!.push(seat);
  }

  const rows: SeatRowData[] = [];
  const sortedRowNumbers = [...rowsMap.keys()].sort((a, b) => a - b);
  for (const rowNum of sortedRowNumbers) {
    const sortedSeats = rowsMap.get(rowNum)!.sort((a: any, b: any) => a.position_in_row - b.position_in_row);
    rows.push({ row_number: rowNum, seats: sortedSeats });
  }

  return { frontSeat, rows };
}

export function getGuestFullName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object" && "full_name" in first) {
      const name = (first as { full_name?: unknown }).full_name;
      return typeof name === "string" ? name.trim() : "";
    }
  }

  if (value && typeof value === "object" && "full_name" in value) {
    const name = (value as { full_name?: unknown }).full_name;
    return typeof name === "string" ? name.trim() : "";
  }

  return "";
}

export function normalizePaymentId(input: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  if (!cleaned) return { paymentCode: "", publicId: "" };

  const publicId = /^PAY-\d{6}$/.test(cleaned) ? cleaned : "";
  const paymentCode = cleaned.replace(/-/g, "");

  return {
    paymentCode: /^PAY\d+$/.test(paymentCode) ? paymentCode : "",
    publicId,
  };
}

export function normalizeReceiptCode(input: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return cleaned.startsWith("PAY") ? cleaned.replace(/-/g, "") : "";
}

export async function findPaymentByPublicOrReceiptIdentifier(supabase: ReturnType<typeof createAdminClient>, rawIdentifier: string) {
  const reference = normalizePaymentId(rawIdentifier);

  if (!reference.publicId && !reference.paymentCode) {
    return null;
  }

  const query = supabase
    .from("payments")
    .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)")
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
    );

  const lookupRows = await query.maybeSingle();
  if (!lookupRows.error && lookupRows.data) {
    return lookupRows.data;
  }

  return null;
}

export async function calculateTotalValidPaymentsForGuestEvent(
  supabase: ReturnType<typeof createAdminClient>,
  guestId: string,
  eventId: string
) {
  const { data, error } = await supabase
    .from("payments")
    .select("amount, is_voided")
    .eq("guest_id", guestId)
    .eq("event_id", eventId)
    .eq("is_voided", false);

  if (error) {
    return { total: 0, error: error.message };
  }

  const total = (data ?? []).reduce((sum, row: any) => sum + Number(row.amount ?? 0), 0);
  return { total, error: null };
}

export async function isPaymentCodeInEvent(supabase: ReturnType<typeof createAdminClient>, paymentCode: string) {
  const { data, error } = await supabase.from("payments").select("*").eq("payment_code", paymentCode).maybeSingle();
  return { data, error };
}

export function getSeatTypeFromPosition(rowPosition: number) {
  return rowPosition === 1 || rowPosition === 5 ? "window" : "aisle";
}

export function normalizeBusSeatType(seatType: string | null | undefined) {
  const raw = String(seatType ?? "").trim().toLowerCase();
  if (!raw) return "aisle";
  if (raw.includes("window")) return "window";
  if (raw.includes("front passenger")) return "window";
  return "aisle";
}

export function seatDisplayNameFromAssignment(assignment: any) {
  const display = getGuestFullName(assignment?.guests);
  return display || "Member";
}
