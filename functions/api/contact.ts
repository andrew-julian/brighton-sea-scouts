/**
 * Brighton Sea Scouts — Contact Form Handler
 *
 * Receives form POST from contact.html, validates fields, and
 * sends a notification email via the Resend API.
 *
 * Environment secrets (set in Cloudflare Pages → Settings → Environment variables):
 *   RESEND_API_KEY  — Resend API key (re_xxxx...)
 *
 * Constants below (edit before deploying):
 *   FROM_ADDRESS    — e.g. "noreply@brightonseascouts.org.au" (must be verified domain in Resend)
 *   TO_ADDRESS      — e.g. "groupleader@scoutsvictoria.org.au"
 */

const FROM_ADDRESS = "noreply@brightonseascouts.org.au";
const TO_ADDRESS   = "gl.1st-14thbrighton@scoutsvictoria.com.au";
const SITE_NAME    = "1st/14th Brighton Sea Scouts";

interface Env {
  RESEND_API_KEY: string;
  saysite_db: D1Database;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // ── Parse form data ──────────────────────────────────────────────────────
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return json({ errors: [{ message: "Invalid form data." }] }, 400);
  }

  const get = (key: string) => (data.get(key) as string | null)?.trim() ?? "";

  const firstName    = get("First Name");
  const lastName     = get("Last Name");
  const email        = get("Email");
  const phone        = get("Phone");
  const enquiryType  = get("Enquiry Type");
  const childName    = get("Child Name");
  const childDob     = get("Child Date of Birth");
  const message      = get("Message");

  // ── Basic validation ─────────────────────────────────────────────────────
  const errors: string[] = [];
  if (!firstName) errors.push("First name is required.");
  if (!lastName)  errors.push("Last name is required.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push("A valid email address is required.");
  if (!enquiryType) errors.push("Please select an enquiry type.");
  if (!message)   errors.push("Message is required.");

  if (errors.length) {
    return json({ errors: errors.map((e) => ({ message: e })) }, 422);
  }

  // ── Build HTML email ─────────────────────────────────────────────────────
  const fullName = `${firstName} ${lastName}`;
  const subject  = `Website Enquiry — ${enquiryType}`;

  const childSection = childName
    ? `
      <tr><td style="padding:6px 0; color:#6b7280; width:160px;">Child's Name</td><td style="padding:6px 0;"><strong>${esc(childName)}</strong></td></tr>
      ${childDob ? `<tr><td style="padding:6px 0; color:#6b7280;">Child's DOB</td><td style="padding:6px 0;">${esc(childDob)}</td></tr>` : ""}
    `
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; font-family:Arial,sans-serif; background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#0a2057; padding:24px 32px;">
          <p style="margin:0; color:#ffffff; font-size:20px; font-weight:bold;">⚓ ${SITE_NAME}</p>
          <p style="margin:4px 0 0; color:#93c5fd; font-size:14px;">New website enquiry</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <h2 style="margin:0 0 4px; color:#0a2057; font-size:18px;">${esc(fullName)}</h2>
          <p style="margin:0 0 20px; color:#6b7280; font-size:14px;">${esc(enquiryType)}</p>

          <table cellpadding="0" cellspacing="0" width="100%" style="font-size:14px; border-top:1px solid #e5e7eb;">
            <tr><td style="padding:10px 0; color:#6b7280; width:160px;">Email</td><td style="padding:10px 0;"><a href="mailto:${esc(email)}" style="color:#1d4ed8;">${esc(email)}</a></td></tr>
            ${phone ? `<tr><td style="padding:6px 0; color:#6b7280;">Phone</td><td style="padding:6px 0;">${esc(phone)}</td></tr>` : ""}
            ${childSection}
          </table>

          <div style="margin-top:20px; padding:16px; background:#f8fafc; border-left:4px solid #0a2057; border-radius:4px; font-size:14px; line-height:1.6; color:#374151;">
            ${esc(message).replace(/\n/g, "<br>")}
          </div>

          <p style="margin:20px 0 0; font-size:13px; color:#9ca3af;">
            Submitted via the Brighton Sea Scouts website contact form.<br>
            Reply directly to this email to respond to ${esc(firstName)}.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f1f5f9; padding:16px 32px; font-size:12px; color:#9ca3af; text-align:center;">
          ${SITE_NAME} · 34 Wilson Street, Brighton VIC 3186
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Plain-text fallback
  const text = [
    `New enquiry from ${fullName}`,
    `Enquiry type: ${enquiryType}`,
    `Email: ${email}`,
    phone        ? `Phone: ${phone}`              : "",
    childName    ? `Child's name: ${childName}`   : "",
    childDob     ? `Child's DOB: ${childDob}`     : "",
    "",
    message,
  ].filter((l) => l !== undefined).join("\n");

  // ── Send via Resend ──────────────────────────────────────────────────────
  const resendPayload = {
    from: `${SITE_NAME} <${FROM_ADDRESS}>`,
    to:   [TO_ADDRESS],
    reply_to: TO_ADDRESS,
    subject,
    html,
    text,
  };

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(resendPayload),
    });
  } catch (err) {
    console.error("Resend fetch error:", err);
    return json({ errors: [{ message: "Failed to send — please try again." }] }, 500);
  }

  if (!resendRes.ok) {
    const body = await resendRes.text();
    console.error("Resend API error:", resendRes.status, body);
    return json({ errors: [{ message: "Failed to send — please try again." }] }, 500);
  }

  return json({ ok: true });
};

// Simple HTML escaping
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
