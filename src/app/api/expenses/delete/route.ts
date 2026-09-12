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

    if (!isOwner && !can(permissions as any, isOwner, "manage_expenses") && !can(permissions as any, isOwner, "delete_records")) {
      return jsonResponse({ ok: false, message: "Forbidden." }, 403);
    }

    const body = await request.json();
    const expenseId = String(body.expense_id ?? "").trim();
    const eventId = String(body.event_id ?? "").trim();

    if (!expenseId) {
      return jsonResponse({ ok: false, message: "Expense ID is required." }, 400);
    }
    if (!eventId) {
      return jsonResponse({ ok: false, message: "Event ID is required." }, 400);
    }

    const supabase = createAdminClient();

    const { data: expense } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .eq("event_id", eventId)
      .single();

    if (!expense) {
      return jsonResponse({ ok: false, message: "Expense not found." }, 404);
    }

    if (expense.is_voided) {
      return jsonResponse({ ok: false, message: "Cannot delete a voided expense." }, 400);
    }

    const previousExpenseData = {
      id: expense.id,
      event_id: expense.event_id,
      expense_code: expense.expense_code,
      category: expense.category,
      description: expense.description,
      vendor: expense.vendor,
      amount: expense.amount,
      payment_method: expense.payment_method,
      recorded_by: expense.recorded_by,
      spent_at: expense.spent_at,
      notes: expense.notes,
      balance_before: expense.balance_before,
      balance_after: expense.balance_after,
      is_voided: expense.is_voided,
      created_at: expense.created_at,
    };

    const { error: deleteError } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)
      .eq("event_id", eventId);

    if (deleteError) {
      return jsonResponse({ ok: false, message: deleteError.message }, 500);
    }

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      actor_id: user?.id ?? "",
      actor_email: profile?.email ?? "",
      action: "expense_deleted",
      record_type: "expense",
      record_id: expenseId,
      previous_value: previousExpenseData,
      new_value: null,
    });

    return jsonResponse({
      ok: true,
      message: "Expense deleted successfully.",
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to delete expense." }, 500);
  }
}