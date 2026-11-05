import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public: the logo appears on the login page and in emails.
export async function GET() {
  const asset = await prisma.asset.findUnique({ where: { key: "logo" } });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
