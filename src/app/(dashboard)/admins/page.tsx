import { createClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/currentAdmin";
import AdminsClient from "./admins-client";

export default async function AdminsPage() {
  const { isOwner } = await getCurrentAdmin();
  const supabase = createClient();

  const { data: admins } = await supabase.from("admin_profiles").select("*").order("created_at");
  const { data: permRows } = await supabase.from("admin_permissions").select("*");
  const { data: invitations } = await supabase
    .from("admin_invitations")
    .select("*")
    .order("created_at", { ascending: false });

  const permsByAdmin: Record<string, string[]> = {};
  (permRows ?? []).forEach((r) => {
    permsByAdmin[r.admin_id] = [...(permsByAdmin[r.admin_id] ?? []), r.permission];
  });

  return (
    <AdminsClient
      admins={admins ?? []}
      permsByAdmin={permsByAdmin}
      invitations={invitations ?? []}
      isOwner={isOwner}
    />
  );
}
