import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getCurrentAdmin, can } from "@/lib/currentAdmin";

function jsonResponse(data: Record<string, any>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function POST(request: Request) {
  try {
    const { user, profile, permissions, isOwner } = await getCurrentAdmin();

    if (!isOwner && !can(permissions as any, isOwner, "manage_guests") && !can(permissions as any, isOwner, "manage_payments")) {
      return jsonResponse({ ok: false, message: "Forbidden." }, 403);
    }

    const body = await request.json();
    const guestId = String(body.guest_id ?? "").trim();
    const eventId = String(body.event_id ?? "").trim();

    if (!guestId) {
      return jsonResponse({ ok: false, message: "Guest ID is required." }, 400);
    }
    if (!eventId) {
      return jsonResponse({ ok: false, message: "Event ID is required." }, 400);
    }

    const supabase = createAdminClient();

    const { data: guest } = await supabase
      .from("guests")
      .select("*")
      .eq("id", guestId)
      .eq("event_id", eventId)
      .single();

    if (!guest) {
      return jsonResponse({ ok: false, message: "Guest not found." }, 404);
    }

    const previousValues: Record<string, any> = {
      full_name: guest.full_name,
      gender: guest.gender,
    };

    const updateData: Record<string, any> = {};
    const hasNameEdit = body.full_name !== undefined && String(body.full_name ?? "").trim() !== "";
    const hasGenderEdit = body.gender !== undefined && body.gender !== guest.gender;

    if (hasNameEdit) {
      if (!isOwner && !can(permissions as any, isOwner, "manage_guests")) {
        return jsonResponse({ ok: false, message: "Forbidden: manage_guests permission required." }, 403);
      }
      const name = String(body.full_name).trim();
      if (!name) {
        return jsonResponse({ ok: false, message: "Name cannot be empty." }, 400);
      }
      updateData.full_name = name;
      previousValues.full_name = guest.full_name;
    }

    if (hasGenderEdit) {
      if (!isOwner && !can(permissions as any, isOwner, "manage_guests")) {
        return jsonResponse({ ok: false, message: "Forbidden: manage_guests permission required." }, 403);
      }
      const gender = body.gender;
      if (gender !== "male" && gender !== "female") {
        return jsonResponse({ ok: false, message: "Invalid gender." }, 400);
      }
      updateData.gender = gender;
      previousValues.gender = guest.gender;
    }

    let updatedGuest = guest;

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date().toISOString();
      const { error: updateError, data: updatedData } = await supabase
        .from("guests")
        .update(updateData)
        .eq("id", guestId)
        .select("*")
        .single();

      if (updateError || !updatedData) {
        return jsonResponse({ ok: false, message: updateError?.message ?? "Failed to update guest." }, 500);
      }

      updatedGuest = updatedData;

      const newValues: Record<string, any> = {};
      if (hasNameEdit) newValues.full_name = updatedGuest.full_name;
      if (hasGenderEdit) newValues.gender = updatedGuest.gender;

      if (Object.keys(newValues).length > 0) {
        await supabase.from("audit_logs").insert({
          event_id: eventId,
          actor_id: user?.id ?? "",
          actor_email: profile?.email ?? "",
          action: "guest_updated",
          record_type: "guest",
          record_id: guestId,
          previous_value: previousValues,
          new_value: newValues,
        });
      }
    }

    let updatedPayment = null;
    const hasAmountEdit = body.amount_paid !== undefined;

    if (hasAmountEdit) {
      if (!isOwner && !can(permissions as any, isOwner, "manage_payments")) {
        return jsonResponse({ ok: false, message: "Forbidden: manage_payments permission required." }, 403);
      }

      const newAmount = parseFloat(body.amount_paid);
      if (Number.isNaN(newAmount) || newAmount <= 0) {
        return jsonResponse({ ok: false, message: "Amount must be a valid positive number." }, 400);
      }

      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("guest_id", guestId)
        .eq("event_id", eventId)
        .eq("is_voided", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (payments && payments.length > 0) {
        const payment = payments[0];
        const previousAmount = payment.amount;

        const { error: paymentError, data: updatedPaymentData } = await supabase
          .from("payments")
          .update({ amount: newAmount })
          .eq("id", payment.id)
          .select("*")
          .single();

        if (paymentError || !updatedPaymentData) {
          return jsonResponse({ ok: false, message: paymentError?.message ?? "Failed to update payment." }, 500);
        }

        updatedPayment = updatedPaymentData;

        await supabase.from("audit_logs").insert({
          event_id: eventId,
          actor_id: user?.id ?? "",
          actor_email: profile?.email ?? "",
          action: "payment_amount_edited",
          record_type: "payment",
          record_id: payment.id,
          previous_value: { amount: previousAmount },
          new_value: { amount: newAmount },
        });
      }
    }

    return jsonResponse({
      ok: true,
      guest: updatedGuest,
      payment: updatedPayment,
      message: "Guest information updated successfully.",
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to update guest." }, 500);
  }
}
