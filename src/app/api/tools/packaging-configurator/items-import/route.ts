import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { parseItems } from "@/lib/packaging/io";
import { uploadedFile } from "@/lib/packaging/http";

// Reads part numbers and quantities from a spreadsheet into the Configurator's lines.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const file = await uploadedFile(req);
  if (file instanceof NextResponse) return file;
  try {
    const r = await parseItems(file.buf, file.name);
    if (!r.items.length) return jsonError(r.errors[0] ?? "The file has no lines.");
    return NextResponse.json(r);
  } catch (err) {
    return jsonError(errorMessage(err));
  }
}
