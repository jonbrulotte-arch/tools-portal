import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const BACKUP_FORMAT = "tools-portal-backup";
export const BACKUP_VERSION = 1;

/** Tables in foreign-key order (parents first). Restore inserts in this order and deletes in reverse. */
export const TABLE_ORDER = [
  "Role",
  "RolePermission",
  "Tool",
  "RoleToolAccess",
  "User",
  "UserToolAccess",
  "InviteToken",
  "PasswordResetToken",
  "Setting",
  "Asset",
  "ShopifyStore",
  "ShopifyDiscount",
  "AuditLog",
] as const;

export type BackupKind = "manual" | "scheduled" | "pre-restore";

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  kind: BackupKind;
  createdBy: string | null;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
};

type ModelMeta = { name: string; delegate: string; fields: { name: string; type: string; kind: string; isList: boolean }[] };

function models(): ModelMeta[] {
  const all = Prisma.dmmf.datamodel.models;
  const missing = all.map((m) => m.name).filter((n) => !(TABLE_ORDER as readonly string[]).includes(n));
  if (missing.length) throw new Error(`Backup TABLE_ORDER is missing models: ${missing.join(", ")}`);
  return TABLE_ORDER.map((name) => {
    const m = all.find((x) => x.name === name);
    if (!m) throw new Error(`Unknown model in TABLE_ORDER: ${name}`);
    return {
      name,
      delegate: name[0].toLowerCase() + name.slice(1),
      fields: m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => ({ name: f.name, type: f.type, kind: f.kind, isList: f.isList })),
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = { findMany: (args?: any) => Promise<any[]>; createMany: (args: any) => Promise<unknown>; deleteMany: (args?: any) => Promise<unknown> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function delegate(client: any, name: string): Delegate {
  return client[name] as Delegate;
}

function serializeRow(row: Record<string, unknown>, meta: ModelMeta) {
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    const v = row[f.name];
    if (v === null || v === undefined) out[f.name] = null;
    else if (f.type === "Bytes") out[f.name] = Buffer.from(v as Uint8Array).toString("base64");
    else if (f.type === "DateTime") out[f.name] = (v as Date).toISOString();
    else if (f.type === "Decimal") out[f.name] = v.toString();
    else out[f.name] = v;
  }
  return out;
}

function deserializeRow(row: Record<string, unknown>, meta: ModelMeta) {
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (!(f.name in row)) continue; // let defaults apply for columns added after the backup
    const v = row[f.name];
    if (v === null) out[f.name] = f.type === "Json" ? Prisma.DbNull : null;
    else if (f.type === "Bytes") out[f.name] = Buffer.from(String(v), "base64");
    else if (f.type === "DateTime") out[f.name] = new Date(String(v));
    else if (f.type === "Decimal") out[f.name] = new Prisma.Decimal(String(v));
    else out[f.name] = v;
  }
  return out;
}

export async function exportAll(kind: BackupKind, createdBy: string | null): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  const counts: Record<string, number> = {};
  for (const meta of models()) {
    const rows = await delegate(prisma, meta.delegate).findMany();
    tables[meta.name] = rows.map((r) => serializeRow(r, meta));
    counts[meta.name] = rows.length;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), kind, createdBy, counts, tables };
}

export function encodeBackup(b: BackupFile): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(b)));
}

export function decodeBackup(buf: Buffer): BackupFile {
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const text = (isGzip ? gunzipSync(buf) : buf).toString("utf8");
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }
  if (parsed?.format !== BACKUP_FORMAT) throw new Error("Not a Tools Portal backup file");
  if (typeof parsed.version !== "number" || parsed.version > BACKUP_VERSION) throw new Error(`Unsupported backup version ${parsed.version}`);
  if (!parsed.tables || typeof parsed.tables !== "object") throw new Error("Backup has no tables");
  for (const name of ["Role", "User"]) {
    if (!Array.isArray(parsed.tables[name]) || parsed.tables[name].length === 0) throw new Error(`Backup is missing ${name} data`);
  }
  return parsed;
}

/** Replace all data with the backup contents in a single transaction. */
export async function restoreAll(b: BackupFile): Promise<Record<string, number>> {
  const metas = models();
  const restored: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      for (const meta of [...metas].reverse()) await delegate(tx, meta.delegate).deleteMany();
      for (const meta of metas) {
        const rows = (b.tables[meta.name] ?? []).map((r) => deserializeRow(r, meta));
        for (let i = 0; i < rows.length; i += 500) {
          await delegate(tx, meta.delegate).createMany({ data: rows.slice(i, i + 500) });
        }
        restored[meta.name] = rows.length;
      }
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );
  return restored;
}

// ─── Backup files on disk ─────────────────────────────────────

export function backupDir() {
  return path.resolve(/* turbopackIgnore: true */ process.env.BACKUP_DIR || "./backups");
}

const NAME_RE = /^backup-\d{8}-\d{6}-(manual|scheduled|pre-restore|upload)(-\d+)?\.json\.gz$/;

export function isValidBackupName(name: string) {
  return NAME_RE.test(name);
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function saveBackupFile(data: Buffer, kind: BackupKind | "upload"): Promise<string> {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  let name = `backup-${stamp()}-${kind}.json.gz`;
  for (let i = 1; await fs.stat(path.join(dir, name)).then(() => true, () => false); i++) name = `backup-${stamp()}-${kind}-${i}.json.gz`;
  await fs.writeFile(path.join(dir, name), data);
  return name;
}

export async function createBackup(kind: BackupKind, createdBy: string | null) {
  const b = await exportAll(kind, createdBy);
  const buf = encodeBackup(b);
  const name = await saveBackupFile(buf, kind);
  return { name, size: buf.length, counts: b.counts };
}

export async function listBackups() {
  const dir = backupDir();
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names.filter(isValidBackupName).map(async (name) => {
      const st = await fs.stat(path.join(dir, name));
      const kind = name.match(NAME_RE)![1];
      return { name, size: st.size, createdAt: st.mtime.toISOString(), kind };
    }),
  );
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackupFile(name: string): Promise<Buffer> {
  if (!isValidBackupName(name)) throw new Error("Invalid backup name");
  return fs.readFile(path.join(backupDir(), name));
}

export async function deleteBackupFile(name: string) {
  if (!isValidBackupName(name)) throw new Error("Invalid backup name");
  await fs.unlink(path.join(backupDir(), name));
}

export async function pruneScheduled(keep: number) {
  const scheduled = (await listBackups()).filter((b) => b.kind === "scheduled");
  for (const old of scheduled.slice(Math.max(keep, 1))) await deleteBackupFile(old.name);
}
