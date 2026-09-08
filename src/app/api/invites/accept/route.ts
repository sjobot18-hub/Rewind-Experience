import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// This route runs with NO user session (the person doesn't have an account
// yet) and uses the service-role admin client. The token itself — a
// cryptographically random 32-byte value the person could only have gotten
// from the email we sent — is what authorizes this action. We never trust
// any role/permission value from the request body; those always come from
// the stored invitation row, so an invited person can never grant themself
// more access than the Owner/inviter originally set.
export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: invitation, error: findError } = await admin
    .from("admin_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (findError || !invitation) {
    return NextResponse.json({ error: "INVITATION_NOT_FOUND" }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "INVITATION_ALREADY_USED_OR_REVOKED" }, { status: 409 });
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await admin.from("admin_invitations").update({ status: "expired" }).eq("id", invitation.id);
    return NextResponse.json({ error: "INVITATION_EXPIRED" }, { status: 409 });
  }

  // Create the real Supabase Auth user — password hashing is handled entirely
  // by Supabase Auth (bcrypt), we never see or store it ourselves.
  const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
  });

  if (createUserError || !newUser.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? "ACCOUNT_CREATION_FAILED" },
      { status: 400 }
    );
  }

  const { error: profileError } = await admin.from("admin_profiles").insert({
    id: newUser.user.id,
    full_name: invitation.full_name,
    email: invitation.email,
    role: invitation.role, // from the invitation, never from the request body
    status: "active",
    is_owner: false, // an invitation can NEVER create an Owner
    created_by: invitation.invited_by,
  });

  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned login with no profile.
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (invitation.permissions?.length) {
    await admin.from("admin_permissions").insert(
      invitation.permissions.map((p: string) => ({
        admin_id: newUser.user!.id,
        permission: p,
        granted_by: invitation.invited_by,
      }))
    );
  }

  await admin
    .from("admin_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_admin_id: newUser.user.id })
    .eq("id", invitation.id);

  await admin.from("audit_logs").insert({
    actor_id: newUser.user.id,
    actor_email: invitation.email,
    action: "administrator_activated",
    record_type: "admin_profile",
    record_id: newUser.user.id,
    new_value: { role: invitation.role, permissions: invitation.permissions },
  });

  return NextResponse.json({ success: true });
}
