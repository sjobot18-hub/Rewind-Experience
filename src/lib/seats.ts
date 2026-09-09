import { createAdminClient } from "@/lib/supabase/admin";

export const SEAT_ELIGIBILITY_THRESHOLD = 5000;

export function normalizePaymentId(input: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  if (!cleaned) return "";

  if (cleaned.startsWith("PAY-2026-")) {
    return cleaned;
  }

  if (cleaned.startsWith("PAY-")) {
    return cleaned;
  }

  if (cleaned.startsWith("PAY")) {
    return cleaned;
  }

  return cleaned;
}

export function normalizeReceiptCode(input: string) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return cleaned.startsWith("PAY") ? cleaned : "";
}

export async function findPaymentByPublicOrReceiptIdentifier(supabase: ReturnType<typeof createAdminClient>, rawIdentifier: string) {
  const identifier = normalizePaymentId(rawIdentifier);
  const code = normalizeReceiptCode(identifier);

  if (!identifier || (!identifier.startsWith("PAY") && !code)) {
    return null;
  }

  const lookupRows = await supabase
    .from("payments")
    .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)")
    .or(`payment_code.eq.${code},public_payment_id.eq.${identifier}`)
    .maybeSingle();

  if (lookupRows.error || !lookupRows.data) {
    // fallback to payment_code by stripping the extra public prefix if the same receipt is posted as PAY0004
    const fallback = await supabase
      .from("payments")
      .select("*, guests:guest_id(full_name, guest_code, id), events:event_id(name, year, id, seat_selection_open, seat_selection_deadline, allow_member_seat_changes)")
      .eq("payment_code", code)
      .maybeSingle();

    if (fallback.error || !fallback.data) {
      return null;
    }

    return fallback.data;
  }

  return lookupRows.data;
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
