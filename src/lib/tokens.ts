import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/crypto";

export async function findValidInvite(token: string) {
  const row = await prisma.inviteToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.status !== "INVITED") return null;
  return row;
}

export async function findValidReset(token: string) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.status !== "ACTIVE") return null;
  return row;
}
