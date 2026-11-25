import { NextResponse } from "next/server";
import { z } from "zod";

/** Recursively trim all strings in a JSON body. */
function trimDeep(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(trimDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimDeep(v)]));
  }
  return value;
}

/** Parse + trim + validate a JSON request body. Returns data or a 400 response. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = schema.safeParse(trimDeep(raw));
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    return NextResponse.json({ error: path ? `${path}: ${first.message}` : first?.message ?? "Invalid request", issues: result.error.issues }, { status: 400 });
  }
  return result.data;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
