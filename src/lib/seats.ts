import { createAdminClient } from "@/lib/supabase/admin";

export const SEAT_ELIGIBILITY_THRESHOLD = 5000;

export function normalizePaymentId(input: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  if (!cleaned) return { code: "", publicId: "" };

  // Accept the receipt-facing payment_code first.
  const code = cleaned.startsWith("PAY") ? cleaned.replace(/-/g, "") : "";
  const publicId = cleaned.startsWith("PAY-") ? cleaned : "";

  return { code, publicId };
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
  const code = normalizeReceiptCode(reference.code || rawIdentifier);

  if (!reference.code && !reference.publicId) {
    return null;
  }

  const query = supabase
    .from("payments")
    .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)");

  let paymentQuery = query;
  if (reference.publicId) {
    paymentQuery = paymentQuery.eq("public_payment_id", reference.publicId);
  } else if (code) {
    paymentQuery = paymentQuery.eq("payment_code", code);
  }

  const lookupRows = await paymentQuery.maybeSingle();
  if (!lookupRows.error && lookupRows.data) {
    return lookupRows.data;
  }

  if (code) {
    const fallback = await supabase
      .from("payments")
      .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)")
      .eq("payment_code", code)
      .maybeSingle();

    if (!fallback.error && fallback.data) {
      return fallback.data;
    }
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
  if (rowPosition === 1 || rowPosition === 5) return "window";
  if (rowPosition === 3) return "middle";
  return "aisle";
}

export function seatDisplayNameFromAssignment(assignment: any) {
  if (!assignment?.guests?.full_name) return "Member";
  return assignment.guests.full_name.trim().split(/\s+/)[0] || "Member";
}
