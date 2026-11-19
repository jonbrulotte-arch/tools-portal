import type { Prisma } from "@prisma/client";

// Filters shared by the Log tab and its CSV export.
export type LogQuery = { email?: string; status?: string; trigger?: string; page?: string };

export function logWhere(q: LogQuery): Prisma.AutoEmailLogWhereInput {
  const where: Prisma.AutoEmailLogWhereInput = {};
  if (q.email) where.emailId = q.email;
  if (q.status === "SENT" || q.status === "FAILED") where.status = q.status;
  if (q.trigger === "SCHEDULE" || q.trigger === "MANUAL" || q.trigger === "TEST") where.trigger = q.trigger;
  return where;
}
