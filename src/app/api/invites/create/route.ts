import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/lib/email";
import { ROLE_DEFAULT_PERMISSIONS, Permission } from "@/lib/permissions";

const INVITE_TTL_HOURS = 72;

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json();
  const { fullName, email, role, permissions } = body as {
    fullName: string;
    email: string;
    role: string;
    permissions: Permission[];
  };

  if (!fullName || !email || !role) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  if (role === "owner") {
    // Belt-and-braces: RLS also blocks this at the database layer.
    return NextResponse.json({ error: "CANNOT_INVITE_AS_OWNER" }, { status: 403 });
  }

  // Only allow permissions the inviter is actually permitted to grant, capped
  // to the role's default set unless the inviter is the Owner. RLS still has
  // final say, but this avoids a confusing round-trip failure for the caller.
  const { data: inviterProfile } = await supabase
    .from("admin_profiles")
    .select("is_owner, full_name")
    .eq("id", user.id)
    .single();

  const grantedPermissions =
    inviterProfile?.is_owner
      ? permissions ?? ROLE_DEFAULT_PERMISSIONS[role] ?? []
      : (permissions ?? []).filter((p) => ROLE_DEFAULT_PERMISSIONS[role]?.includes(p));

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  // This insert runs under the CALLER's session — RLS policy
  // "admins with invite permission can create invitations" enforces
  // authorization at the database layer, not just here.
  const { data: invitation, error } = await supabase
    .from("admin_invitations")
    .insert({
      full_name: fullName,
      email,
      role,
      permissions: grantedPermissions,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`;

  try {
    await sendInvitationEmail({
      to: email,
      fullName,
      inviteUrl,
      invitedByName: inviterProfile?.full_name ?? "The Owner",
      role,
      expiresAt: new Date(expiresAt).toLocaleDateString("en-NG"),
    });
  } catch (emailError) {
    // The invitation row still exists — surface this clearly rather than
    // pretending the email went out.
    return NextResponse.json(
      { warning: "INVITATION_CREATED_BUT_EMAIL_FAILED", invitationId: invitation.id },
      { status: 207 }
    );
  }

  return NextResponse.json({ success: true, invitationId: invitation.id });
}
