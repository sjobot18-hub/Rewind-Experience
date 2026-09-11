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
