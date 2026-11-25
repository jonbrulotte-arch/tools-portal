import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { plainValue, readSalsifyRecord, updateSalsifyProperties } from "@/lib/salsify";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { latestReport, pushBlocker, pushBody, pushValuesFor, resolvePackagingKey } from "@/lib/packaging/jobs";
import { salsifyOrg } from "@/lib/packaging/data";

const schema = z.object({ partNumber: z.string().min(1, "Enter a part number").max(100), write: z.boolean().default(false) });

// Shows what the push would write for one product; with write=true writes it and reads it back.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_SETTINGS_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, schema);
  if (body instanceof NextResponse) return body;
  const s = await getSetting("packagingConfigurator");
  const blocker = await pushBlocker(s);
  if (blocker) return jsonError(blocker);
  const latest = (await latestReport())!;
  const r = latest.report.results.find((x) => x.partNumber.toUpperCase() === body.partNumber.toUpperCase());
  if (!r) return jsonError(`${body.partNumber} isn't in the newest analysis (it may be missing size or weight in Salsify, or not on the list).`, 404);
  const values = pushValuesFor(r);
  if (!values) return jsonError(`No packaging fits ${r.partNumber}, so there's nothing to write.`);
  const properties = pushBody(s, values);
  if (!body.write) return NextResponse.json({ partNumber: r.partNumber, packaging: r.packagingName, properties, written: false });
  try {
    const { key, owner } = await resolvePackagingKey(s, { id: user.id, email: user.email });
    const orgId = await salsifyOrg(s);
    await updateSalsifyProperties(key, orgId, r.partNumber, properties);
    const record = await readSalsifyRecord(key, orgId, r.partNumber);
    const readBack = Object.fromEntries(Object.keys(properties).map((p) => [p, plainValue(record?.[p]) ?? null]));
    await prisma.packPush.upsert({ where: { partNumber: r.partNumber }, create: { partNumber: r.partNumber, values, pushedAt: new Date() }, update: { values, pushedAt: new Date(), lastError: null, lastErrorAt: null } });
    await logAudit({ action: "packaging.push_test_written", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackPush", targetId: r.partNumber, metadata: { properties, readBack, salsifyKeyOf: owner } });
    return NextResponse.json({ partNumber: r.partNumber, packaging: r.packagingName, properties, written: true, readBack });
  } catch (err) {
    await logAudit({ action: "packaging.push_test_written", category: "TOOL", actorId: user.id, actorEmail: user.email, success: false, targetType: "PackPush", targetId: r.partNumber, metadata: { error: errorMessage(err) } });
    return jsonError(errorMessage(err), 502);
  }
}
