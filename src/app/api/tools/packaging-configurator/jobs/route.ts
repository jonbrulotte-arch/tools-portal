import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_RUN_PERMISSION, PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { cancelPush, cancelSync, jobStatus, startAnalysis, startPush, startSync } from "@/lib/packaging/jobs";

const jobSchema = z.object({ job: z.enum(["sync", "analysis", "push"]), action: z.enum(["start", "cancel"]) });

/** Sync, analysis and push status (polled by the Report and Settings pages). */
export async function GET() {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await jobStatus());
}

/** Start or cancel a sync, analysis or push now. Sync and analysis need "run the sync & report"; the push (it writes to Salsify) needs the settings permission. */
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, jobSchema);
  if (body instanceof NextResponse) return body;
  const needed = body.job === "push" ? PACKAGING_SETTINGS_PERMISSION : PACKAGING_RUN_PERMISSION;
  if (!user.can(needed)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { tool: PACKAGING_TOOL, permission: needed, job: body.job } });
    return jsonError("You do not have permission to do that", 403);
  }
  const actor = { id: user.id, email: user.email };
  try {
    if (body.action === "cancel") {
      if (body.job === "analysis") return jsonError("The analysis can't be cancelled; it takes a minute or two at most.");
      const id = body.job === "sync" ? await cancelSync(actor) : await cancelPush(actor);
      return NextResponse.json({ ok: true, message: id ? "Stopping… it ends after the current page of products." : "Nothing is running." });
    }
    if (body.job === "sync") await startSync(actor);
    else if (body.job === "push") await startPush(actor);
    else {
      await startAnalysis(actor, "manual");
      await logAudit({ action: "packaging.analysis_started", category: "TOOL", actorId: user.id, actorEmail: user.email });
    }
    return NextResponse.json({ ok: true, status: await jobStatus() });
  } catch (err) {
    await logAudit({ action: `packaging.${body.job}_start_failed`, category: "TOOL", actorId: user.id, actorEmail: user.email, success: false, metadata: { error: errorMessage(err) } });
    return jsonError(errorMessage(err));
  }
}
