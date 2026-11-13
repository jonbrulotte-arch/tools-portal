import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

// Per-user API credentials for outside services. Each user stores their own key in My Profile;
// keys are encrypted at rest and never sent back to the browser.

export const CREDENTIAL_PROVIDERS = {
  salsify: { label: "Salsify", tool: "shipping-rates" },
} as const;
export type CredentialProvider = keyof typeof CREDENTIAL_PROVIDERS;

export const isCredentialProvider = (p: string): p is CredentialProvider => p in CREDENTIAL_PROVIDERS;

export async function getUserSecret(userId: string, provider: CredentialProvider): Promise<string | null> {
  const row = await prisma.userCredential.findUnique({ where: { userId_provider: { userId, provider } } });
  return row ? decrypt(row.encSecret) : null;
}

export async function credentialStatus(userId: string): Promise<Partial<Record<CredentialProvider, { updatedAt: string }>>> {
  const rows = await prisma.userCredential.findMany({ where: { userId }, select: { provider: true, updatedAt: true } });
  return Object.fromEntries(rows.filter((r) => isCredentialProvider(r.provider)).map((r) => [r.provider, { updatedAt: r.updatedAt.toISOString() }]));
}

export async function setUserSecret(userId: string, provider: CredentialProvider, secret: string) {
  const encSecret = encrypt(secret);
  await prisma.userCredential.upsert({ where: { userId_provider: { userId, provider } }, create: { userId, provider, encSecret }, update: { encSecret } });
}

export async function deleteUserSecret(userId: string, provider: CredentialProvider) {
  await prisma.userCredential.deleteMany({ where: { userId, provider } });
}
