import type { BrandingSettings } from "@/lib/settings";

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:8016").replace(/\/$/, "");
  return `${base}${path}`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(branding: BrandingSettings, heading: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const logo = branding.hasLogo
    ? `<img src="${esc(appUrl(`/api/branding/logo?v=${branding.logoVersion}`))}" alt="${esc(branding.siteName)}" style="max-height:40px;max-width:200px" />`
    : `<span style="font-size:22px;font-weight:700;color:#ffffff">${esc(branding.siteName)}</span>`;
  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:Segoe UI,Arial,sans-serif;color:#374151">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<tr><td style="background:#111827;padding:20px 32px">${logo}</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-size:20px;color:#111827">${esc(heading)}</h1>
${bodyHtml}
${cta ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block">${esc(cta.label)}</a></p>
<p style="font-size:12px;color:#6b7280">If the button doesn't work, paste this link into your browser:<br><span style="color:#2563eb;word-break:break-all">${esc(cta.url)}</span></p>` : ""}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">${esc(branding.siteName)}</td></tr>
</table></td></tr></table></body></html>`;
}

export function inviteEmail(branding: BrandingSettings, opts: { name: string; inviterName: string; url: string; expiresHours: number }) {
  const subject = `You're invited to ${branding.siteName}`;
  const html = layout(
    branding,
    `Welcome, ${opts.name}`,
    `<p style="font-size:14px;line-height:1.6">${esc(opts.inviterName)} has invited you to <strong>${esc(branding.siteName)}</strong>, our internal tools platform.</p>
<p style="font-size:14px;line-height:1.6">Click below to set your password and activate your account. This link expires in ${opts.expiresHours} hours.</p>`,
    { label: "Accept invitation", url: opts.url },
  );
  return { subject, html };
}

export function resetEmail(branding: BrandingSettings, opts: { name: string; url: string; expiresMinutes: number }) {
  const subject = `Reset your ${branding.siteName} password`;
  const html = layout(
    branding,
    "Password reset",
    `<p style="font-size:14px;line-height:1.6">Hi ${esc(opts.name)}, we received a request to reset your password.</p>
<p style="font-size:14px;line-height:1.6">This link expires in ${opts.expiresMinutes} minutes. If you didn't request it, you can ignore this email.</p>`,
    { label: "Reset password", url: opts.url },
  );
  return { subject, html };
}

export function testEmail(branding: BrandingSettings) {
  return {
    subject: `${branding.siteName}: test email`,
    html: layout(branding, "Email is working", `<p style="font-size:14px;line-height:1.6">Microsoft Graph email delivery is configured correctly.</p>`),
  };
}
