import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    /** Unix seconds when the user signed in; compared against the session epoch after a restore. */
    issuedAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    loginAt?: number;
  }
}
