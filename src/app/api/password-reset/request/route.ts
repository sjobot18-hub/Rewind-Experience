import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPasswordResetEmail } from "@/lib/email";

// Always returns the same generic response whether or not the email exists,
// so this endpoint can't be used to enumerate valid administrator accounts.
const GENERIC_RESPONSE = NextResponse.json({
  message: "If that email is registered, a password reset link has been sent.",
});

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return GENERIC_RESPONSE;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("admin_profiles")
    .select("id, email, status")
    .eq("email", email)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    return GENERIC_RESPONSE;
  }

  // generateLink produces a genuine, single-use, time-limited Supabase Auth
  // recovery token. We never construct or sign this ourselves.
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password` },
  });

  if (error || !linkData) {
    return GENERIC_RESPONSE;
  }

  await admin.from("password_reset_requests").insert({
    admin_id: profile.id,
    email,
    ip_address: req.headers.get("x-forwarded-for") ?? undefined,
  });

  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    actor_email: email,
    action: "password_reset_requested",
    record_type: "admin_profile",
    record_id: profile.id,
  });

  try {
    await sendPasswordResetEmail({ to: email, resetUrl: linkData.properties.action_link });
  } catch {
    // Fall through silently — still returns the generic response so we
    // don't reveal delivery details to the caller.
  }

  return GENERIC_RESPONSE;
}
