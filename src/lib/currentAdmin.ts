import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Permission } from "@/lib/permissions";
import { EventRecord } from "@/lib/types";

export async function getCurrentAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login");
  }

  const { data: permRows } = await supabase
    .from("admin_permissions")
    .select("permission")
    .eq("admin_id", user.id);

  const permissions = (permRows ?? []).map((r) => r.permission) as Permission[];

  return { user, profile, permissions, isOwner: profile.is_owner as boolean };
}

export async function getActiveEvent(eventIdOverride?: string): Promise<EventRecord | null> {
  const supabase = createClient();
  let query = supabase.from("events").select("*");
  query = eventIdOverride ? query.eq("id", eventIdOverride) : query.eq("is_currently_active", true);
  const { data } = await query.single();
  return (data as EventRecord) ?? null;
}

export function can(permissions: Permission[], isOwner: boolean, perm: Permission) {
  return isOwner || permissions.includes(perm);
}
