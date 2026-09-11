import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCurrentAdmin, can } from "@/lib/currentAdmin";
import { getPermanentBigCostaBus } from "@/lib/seats";

export async function POST(request: Request) {
  try {
    const { permissions, isOwner } = await getCurrentAdmin();

    if (!isOwner && !can(permissions as any, isOwner, "manage_event_settings")) {
      return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const eventId = String(body.event_id ?? "").trim();

    if (!eventId) {
      return NextResponse.json({ ok: false, message: "Event ID is required." }, { status: 400 });
    }

    const authSupabase = createClient();
    const adminSupabase = createAdminClient();

    const { error: switchError } = await authSupabase.rpc("switch_active_event", {
      p_event_id: eventId,
    });

    if (switchError) {
      return NextResponse.json({ ok: false, message: switchError.message }, { status: 409 });
    }

    const bus = await getPermanentBigCostaBus(adminSupabase);

    if (bus) {
      const { error: busUpdateError } = await adminSupabase
        .from("event_buses")
        .update({ event_id: eventId })
        .eq("id", bus.id);

      if (busUpdateError) {
        return NextResponse.json(
          { ok: false, message: "Event switched but failed to update permanent bus: " + busUpdateError.message },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({ ok: true, message: "Active event switched and permanent bus updated." });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message ?? "Failed to switch event." }, { status: 500 });
  }
}
