import { z } from "zod";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export const roleSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  description: z.string().max(300).default(""),
  permissions: z.array(z.string().refine((p) => (ALL_PERMISSIONS as string[]).includes(p), "Unknown permission")).default([]),
  toolIds: z.array(z.string()).default([]),
});
