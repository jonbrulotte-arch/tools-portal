import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

class LockedError extends CredentialsSignin {
  code = "locked";
}

function requestInfo(request: Request | undefined) {
  const h = request?.headers;
  const fwd = h?.get("x-forwarded-for");
  return {
    ip: (fwd ? fwd.split(",")[0].trim() : null) || h?.get("x-real-ip") || null,
    userAgent: h?.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const info = requestInfo(request);
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const fail = async (reason: string, userId?: string) => {
          await logAudit({ action: "auth.login_failed", category: "AUTH", actorId: userId ?? null, actorEmail: email, success: false, metadata: { reason }, ...info });
          return null;
        };

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return fail("unknown_email");
        if (user.status === "DISABLED") return fail("account_disabled", user.id);
        if (user.status === "INVITED" || !user.passwordHash) return fail("invite_not_accepted", user.id);
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await fail("account_locked", user.id);
          throw new LockedError();
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          const security = await getSetting("security");
          const count = user.failedLoginCount + 1;
          const lock = count >= security.maxFailedLogins;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: lock ? 0 : count,
              lockedUntil: lock ? new Date(Date.now() + security.lockoutMinutes * 60_000) : user.lockedUntil,
            },
          });
          await fail(lock ? "bad_password_locked" : "bad_password", user.id);
          if (lock) {
            await logAudit({ action: "auth.account_locked", category: "AUTH", actorId: user.id, actorEmail: email, success: false, metadata: { minutes: security.lockoutMinutes }, ...info });
          }
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await logAudit({ action: "auth.login", category: "AUTH", actorId: user.id, actorEmail: email, ...info });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.loginAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.issuedAt = typeof token.loginAt === "number" ? token.loginAt : 0;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.id) {
        await logAudit({ action: "auth.logout", category: "AUTH", actorId: token.id as string, actorEmail: token.email ?? null });
      }
    },
  },
});
