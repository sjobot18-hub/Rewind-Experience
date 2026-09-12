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

    if (!isOwner && !can(permissions as any, isOwner, "manage_expenses")) {
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
      return jsonResponse({ ok: false, message: "Cannot edit a voided expense." }, 400);
    }

    const previousValues: Record<string, any> = {
      category: expense.category,
      description: expense.description,
      vendor: expense.vendor,
      amount: expense.amount,
      payment_method: expense.payment_method,
      spent_at: expense.spent_at,
      notes: expense.notes,
    };

    const updateData: Record<string, any> = {};
    const changes: Record<string, any> = {};

    if (body.category !== undefined && String(body.category).trim() !== "") {
      const category = String(body.category).trim();
      updateData.category = category;
      changes.category = { from: expense.category, to: category };
    }

    if (body.description !== undefined && String(body.description).trim() !== "") {
      const description = String(body.description).trim();
      updateData.description = description;
      changes.description = { from: expense.description, to: description };
    } else if (body.description !== undefined) {
      return jsonResponse({ ok: false, message: "Description cannot be empty." }, 400);
    }

    if (body.vendor !== undefined) {
      const vendor = body.vendor === null || body.vendor === "" ? null : String(body.vendor).trim();
      updateData.vendor = vendor;
      changes.vendor = { from: expense.vendor ?? null, to: vendor };
    }

    if (body.amount !== undefined) {
      const amount = parseFloat(body.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        return jsonResponse({ ok: false, message: "Amount must be a valid positive number." }, 400);
      }
      updateData.amount = amount;
      changes.amount = { from: expense.amount, to: amount };
    }

    if (body.payment_method !== undefined) {
      const method = body.payment_method;
      if (method !== "cash" && method !== "transfer" && method !== "pos") {
        return jsonResponse({ ok: false, message: "Invalid payment method." }, 400);
      }
      updateData.payment_method = method;
      changes.payment_method = { from: expense.payment_method, to: method };
    }

    if (body.spent_at !== undefined) {
      updateData.spent_at = body.spent_at;
      changes.spent_at = { from: expense.spent_at, to: body.spent_at };
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes === null || body.notes === "" ? null : String(body.notes);
      changes.notes = { from: expense.notes ?? null, to: updateData.notes };
    }

    if (Object.keys(updateData).length === 0) {
      return jsonResponse({ ok: false, message: "No fields to update." }, 400);
    }

    if (changes.amount) {
      updateData.balance_before = expense.balance_before;
      updateData.balance_after = expense.balance_after;
    }

    updateData.updated_at = new Date().toISOString();

    const { error: updateError, data: updatedExpense } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", expenseId)
      .select("*")
      .single();

    if (updateError || !updatedExpense) {
      return jsonResponse({ ok: false, message: updateError?.message ?? "Failed to update expense." }, 500);
    }

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      actor_id: user?.id ?? "",
      actor_email: profile?.email ?? "",
      action: "expense_updated",
      record_type: "expense",
      record_id: expenseId,
      previous_value: previousValues,
      new_value: updatedExpense,
    });

    return jsonResponse({
      ok: true,
      expense: updatedExpense,
      message: "Expense updated successfully.",
    });
  } catch (error: any) {
    return jsonResponse({ ok: false, message: error?.message ?? "Failed to update expense." }, 500);
  }
}
