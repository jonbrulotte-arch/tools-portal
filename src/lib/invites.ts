import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/crypto";
import { getBranding, getSetting } from "@/lib/settings";
import { appUrl, inviteEmail, resetEmail } from "@/lib/email-templates";
import { sendMail } from "@/lib/graph-mail";

/** Issue a fresh invite token (invalidating older ones) and email it. */
export async function sendInvite(user: { id: string; email: string; name: string }, inviterName: string) {
  const security = await getSetting("security");
  const token = generateToken();
  await prisma.$transaction([
    prisma.inviteToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.inviteToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + security.inviteExpiryHours * 3_600_000) },
    }),
    prisma.user.update({ where: { id: user.id }, data: { invitedAt: new Date() } }),
  ]);
  const branding = await getBranding();
  const url = appUrl(`/invite/${token}`);
  const { subject, html } = inviteEmail(branding, { name: user.name, inviterName, url, expiresHours: security.inviteExpiryHours });
  try {
    await sendMail({ email: user.email, name: user.name }, subject, html);
    return { url, emailError: null as string | null };
  } catch (err) {
    return { url, emailError: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendPasswordReset(user: { id: string; email: string; name: string }) {
  const security = await getSetting("security");
  const token = generateToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + security.resetExpiryMinutes * 60_000) },
    }),
  ]);
  const branding = await getBranding();
  const { subject, html } = resetEmail(branding, { name: user.name, url: appUrl(`/reset-password/${token}`), expiresMinutes: security.resetExpiryMinutes });
  await sendMail({ email: user.email, name: user.name }, subject, html);
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain letters and numbers.";
  return null;
}
