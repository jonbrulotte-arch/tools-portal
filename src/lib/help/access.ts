import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CurrentUser } from "@/lib/rbac";
import { docBySlug, HELP_DOCS, managerPermission, type HelpDoc } from "@/lib/help/registry";

// Who may read which doc. A tool's docs need access to that (enabled) tool; its admin doc also needs
// the tool's "manage tool settings" permission; admin docs need the matching admin permission.

type DocUser = Pick<CurrentUser, "isSuperAdmin" | "can" | "canUseTool">;

export function canSeeDoc(user: DocUser, doc: HelpDoc): boolean {
  const a = doc.audience;
  if ("everyone" in a) return true;
  if ("tool" in a) return user.canUseTool(a.tool);
  if ("toolManager" in a) return user.canUseTool(a.toolManager) && (user.isSuperAdmin || user.can(managerPermission(a.toolManager)));
  return user.isSuperAdmin || user.can(a.permission);
}

export const visibleDocs = (user: DocUser) => HELP_DOCS.filter((d) => canSeeDoc(user, d));

/** The doc for a tool's Help link: the admin doc for managers, else the user guide. */
export function toolHelpDoc(user: DocUser, toolSlug: string): HelpDoc | null {
  const docs = visibleDocs(user).filter((d) => d.toolSlug === toolSlug);
  return docs.find((d) => "toolManager" in d.audience) ?? docs[0] ?? null;
}

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "help");
const SAFE_SLUG = /^[a-z0-9-]+$/;
const SAFE_IMAGE = /^[a-z0-9-]+\.(png|jpg|webp)$/;

export async function readDoc(slug: string): Promise<string | null> {
  if (!SAFE_SLUG.test(slug) || !docBySlug(slug)) return null;
  return readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8").catch(() => null);
}

export async function readDocImage(slug: string, file: string): Promise<{ data: Buffer; type: string } | null> {
  if (!SAFE_SLUG.test(slug) || !SAFE_IMAGE.test(file) || !docBySlug(slug)) return null;
  const data = await readFile(path.join(CONTENT_DIR, "images", slug, file)).catch(() => null);
  if (!data) return null;
  const ext = file.split(".").pop()!;
  return { data, type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
}
