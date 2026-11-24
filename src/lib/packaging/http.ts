import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { XLSX_TYPE } from "@/lib/packaging/io";

// Upload and download helpers for the Packaging Configurator's spreadsheet routes.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The uploaded file (form field "file"), or an error response. */
export async function uploadedFile(req: Request): Promise<{ buf: Buffer; name: string; form: FormData } | NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Send the file as a form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError("The file is over 10 MB.");
  if (!/\.(xlsx|csv)$/i.test(file.name)) return jsonError("Upload an .xlsx (Excel) or .csv file.");
  return { buf: Buffer.from(await file.arrayBuffer()), name: file.name, form };
}

export function xlsxResponse(buf: Buffer, fileName: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`, "Cache-Control": "no-store" },
  });
}

/** Today as YYYY-MM-DD, for file names. */
export const today = () => new Date().toISOString().slice(0, 10);
