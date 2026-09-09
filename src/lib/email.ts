import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("RESEND_API_KEY is not configured");
}

const resend = new Resend(apiKey);

const FROM =
  process.env.EMAIL_FROM ||
  "The Rewind Experience <no-reply@markethub.com.ng>";

export async function sendInvitationEmail(opts: {
  to: string;
  fullName: string;
  inviteUrl: string;
  invitedByName: string;
  role: string;
  expiresAt: string;
}) {
  const {
    to,
    fullName,
    inviteUrl,
    invitedByName,
    role,
    expiresAt,
  } = opts;

  const safeInviteUrl = inviteUrl.trim();

  if (!safeInviteUrl.startsWith("http://") && !safeInviteUrl.startsWith("https://")) {
    throw new Error(
      `Invalid invitation URL: ${safeInviteUrl}`
    );
  }

  const formattedRole = role.replace(/_/g, " ");

  return resend.emails.send({
    from: FROM,
    to: [to],
    subject: "You've been invited to administer The Rewind Experience",

    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Rewind Experience Invitation</title>
</head>

<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#222;">

  <div style="max-width:600px;margin:40px auto;padding:20px;">

    <div style="background:#ffffff;border-radius:10px;padding:40px;">

      <h2 style="margin:0 0 24px;color:#0B1F3A;">
        The Rewind Experience
      </h2>

      <p style="font-size:16px;line-height:1.6;">
        Hi ${fullName},
      </p>

      <p style="font-size:16px;line-height:1.6;">
        ${invitedByName} has invited you to join the administration
        team as <strong>${formattedRole}</strong>.
      </p>

      <p style="font-size:16px;line-height:1.6;">
        Click the button below to accept your invitation and create
        your administrator account.
      </p>

      <div style="margin:32px 0;text-align:center;">

        <a
          href="${safeInviteUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display:inline-block;
            background:#1447E6;
            color:#ffffff;
            text-decoration:none;
            padding:14px 24px;
            border-radius:6px;
            font-size:16px;
            font-weight:bold;
          "
        >
          Accept Invitation
        </a>

      </div>

      <p style="font-size:13px;line-height:1.6;color:#666;">
        If the button above does not work, copy and paste this link
        into your browser:
      </p>

      <p style="font-size:13px;line-height:1.6;word-break:break-all;">
        <a
          href="${safeInviteUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="color:#1447E6;"
        >
          ${safeInviteUrl}
        </a>
      </p>

      <p style="font-size:13px;line-height:1.6;color:#666;margin-top:30px;">
        This invitation expires on ${expiresAt} and can only be used once.
        If you were not expecting this invitation, you can safely ignore
        this email.
      </p>

    </div>

  </div>

</body>
</html>
    `,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
}) {
  const safeResetUrl = opts.resetUrl.trim();

  if (!safeResetUrl.startsWith("http://") && !safeResetUrl.startsWith("https://")) {
    throw new Error(`Invalid password reset URL: ${safeResetUrl}`);
  }

  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "Reset your password | The Rewind Experience",

    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>

<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#222;">

  <div style="max-width:600px;margin:40px auto;padding:20px;">

    <div style="background:#ffffff;border-radius:10px;padding:40px;">

      <h2 style="margin:0 0 24px;color:#0B1F3A;">
        Password Reset Request
      </h2>

      <p style="font-size:16px;line-height:1.6;">
        We received a request to reset your password.
      </p>

      <p style="font-size:16px;line-height:1.6;">
        Click the button below to choose a new password.
      </p>

      <div style="margin:32px 0;text-align:center;">

        <a
          href="${safeResetUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display:inline-block;
            background:#1447E6;
            color:#ffffff;
            text-decoration:none;
            padding:14px 24px;
            border-radius:6px;
            font-size:16px;
            font-weight:bold;
          "
        >
          Reset Password
        </a>

      </div>

      <p style="font-size:13px;line-height:1.6;color:#666;">
        If the button does not work, copy and paste this link into your browser:
      </p>

      <p style="font-size:13px;line-height:1.6;word-break:break-all;">
        <a
          href="${safeResetUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="color:#1447E6;"
        >
          ${safeResetUrl}
        </a>
      </p>

      <p style="font-size:13px;line-height:1.6;color:#666;margin-top:30px;">
        This link expires in 1 hour and can only be used once.
        If you did not request this, no action is needed.
      </p>

    </div>

  </div>

</body>
</html>
    `,
  });
}