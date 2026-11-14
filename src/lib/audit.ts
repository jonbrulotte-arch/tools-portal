import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestInfo } from "@/lib/request-info";

export type AuditCategory = "AUTH" | "USER" | "ROLE" | "TOOL" | "SETTINGS" | "BACKUP" | "NAV" | "AUDIT" | "SHOPIFY" | "SYSTEM";

export type AuditEntry = {
  action: string;
  category: AuditCategory;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  success?: boolean;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** Record an activity. Never throws: logging must not break the action being logged. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const req = entry.ip === undefined && entry.userAgent === undefined ? await getRequestInfo() : { ip: entry.ip ?? null, userAgent: entry.userAgent ?? null };
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        category: entry.category,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        success: entry.success ?? true,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: req.ip,
        userAgent: req.userAgent,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", entry.action, err);
  }
}
