import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "The Rewind Experience <no-reply@example.com>";

export async function sendInvitationEmail(opts: {
  to: string;
  fullName: string;
  inviteUrl: string;
  invitedByName: string;
  role: string;
  expiresAt: string;
}) {
  const { to, fullName, inviteUrl, invitedByName, role, expiresAt } = opts;
  return resend.emails.send({
    from: FROM,
    to,
    subject: "You've been invited to administer The Rewind Experience",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#0B1F3A;">The Rewind Experience</h2>
        <p>Hi ${fullName},</p>
        <p>${invitedByName} has invited you to join the administration team as
        <strong>${role.replace("_", " ")}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${inviteUrl}" style="background:#1447E6;color:#fff;padding:12px 20px;
          border-radius:6px;text-decoration:none;font-weight:600;">Accept Invitation</a>
        </p>
        <p style="color:#666;font-size:13px;">This invitation link expires on ${expiresAt}
        and can only be used once. If you were not expecting this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(opts: { to: string; resetUrl: string }) {
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "Reset your password — The Rewind Experience",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#0B1F3A;">Password Reset Request</h2>
        <p>We received a request to reset your password. Click below to choose a new one:</p>
        <p style="margin: 24px 0;">
          <a href="${opts.resetUrl}" style="background:#1447E6;color:#fff;padding:12px 20px;
          border-radius:6px;text-decoration:none;font-weight:600;">Reset Password</a>
        </p>
        <p style="color:#666;font-size:13px;">This link expires in 1 hour and can only be used once.
        If you did not request this, no action is needed — your password will not change.</p>
      </div>
    `,
  });
}
