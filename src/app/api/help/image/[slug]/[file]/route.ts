import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { canSeeDoc, readDocImage } from "@/lib/help/access";
import { docBySlug } from "@/lib/help/registry";

// A Help & Docs screenshot, only for people who may read that doc.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const { slug, file } = await params;
  const doc = docBySlug(slug);
  if (!doc || !canSeeDoc(user, doc)) return jsonError("Not found", 404);
  const img = await readDocImage(slug, decodeURIComponent(file));
  if (!img) return jsonError("Not found", 404);
  return new NextResponse(new Uint8Array(img.data), { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
