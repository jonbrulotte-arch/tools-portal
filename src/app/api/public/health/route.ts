import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Liveness/readiness probe for Docker and deploy.sh. Reveals no data.
export async function GET() {
  const version = process.env.APP_VERSION || "dev";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", version }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable", version }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
