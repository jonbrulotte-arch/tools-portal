import { readFileSync } from "node:fs";
import sql from "mssql";
import { decrypt } from "@/lib/crypto";
import type { AutoEmailSettings } from "@/lib/settings";

// SQL Server access for Automated Emails. Queries must be a single read-only SELECT (checked here,
// on top of a read-only SQL login), run inside a transaction that is always rolled back, with a time
// limit and a row cap. AUTO_EMAILS_SQL_STUB (path to a JSON file of { columns, rows }) replaces the
// database for tests and local development.

export type SqlColumn = { name: string; type: string };
export type SqlValue = string | number | boolean | null;
export type SqlResult = { columns: SqlColumn[]; rows: Record<string, SqlValue>[]; truncated: boolean; ms: number };

const CONNECT_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 60_000;

const FORBIDDEN = [
  "INSERT", "UPDATE", "DELETE", "MERGE", "EXEC", "EXECUTE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE", "DENY",
  "INTO", "BACKUP", "RESTORE", "DBCC", "SHUTDOWN", "OPENROWSET", "OPENQUERY", "OPENDATASOURCE", "OPENXML", "BULK", "KILL",
  "RECONFIGURE", "WAITFOR", "USE", "DECLARE", "SET", "BEGIN", "COMMIT", "ROLLBACK", "SAVE",
];

/** Removes comments, string literals and quoted/bracketed identifiers so only SQL keywords remain to inspect. */
function skeleton(query: string): string {
  let out = "";
  for (let i = 0; i < query.length; ) {
    const c = query[i], n = query[i + 1];
    if (c === "-" && n === "-") {
      while (i < query.length && query[i] !== "\n") i++;
      out += " ";
    } else if (c === "/" && n === "*") {
      const end = query.indexOf("*/", i + 2);
      i = end < 0 ? query.length : end + 2;
      out += " ";
    } else if (c === "'" || (c === "N" && n === "'")) {
      i += c === "N" ? 2 : 1;
      for (; i < query.length; i++) {
        if (query[i] === "'" && query[i + 1] === "'") i++;
        else if (query[i] === "'") break;
      }
      i++;
      out += " ''";
    } else if (c === "[" || c === '"') {
      const close = c === "[" ? "]" : '"';
      i++;
      for (; i < query.length; i++) {
        if (query[i] === close && query[i + 1] === close) i++;
        else if (query[i] === close) break;
      }
      i++;
      out += " _id_ ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Throws unless the query is a single read-only SELECT (optionally starting with WITH). */
export function assertReadOnly(query: string): void {
  if (!query.trim()) throw new Error("Enter a SQL query.");
  const s = skeleton(query).replace(/;\s*$/, "").trim();
  if (!s) throw new Error("The query is empty once comments are removed.");
  if (s.includes(";")) throw new Error("Only one statement is allowed (remove the extra ';').");
  if (!/^(SELECT|WITH)\b/i.test(s)) throw new Error("The query must start with SELECT (or WITH … SELECT).");
  const bad = s.match(new RegExp(`\\b(${FORBIDDEN.join("|")})\\b|\\b(xp|sp)_\\w*`, "i"));
  if (bad) throw new Error(`Only read-only queries are allowed: "${bad[0].toUpperCase()}" isn't permitted here.`);
}

function normalize(v: unknown): SqlValue {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (Buffer.isBuffer(v)) return `0x${v.toString("hex")}`;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  return String(v);
}

function poolConfig(s: AutoEmailSettings["sql"]): sql.config {
  if (!s.server || !s.database || !s.encUser || !s.encPassword) throw new Error("The SQL Server connection isn't set up (Automated Emails → Settings → SQL Server).");
  return {
    server: s.server,
    port: s.port || 1433,
    database: s.database,
    user: decrypt(s.encUser),
    password: decrypt(s.encPassword),
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    pool: { max: 3, min: 0, idleTimeoutMillis: 60_000 },
    options: { encrypt: s.encrypt, trustServerCertificate: s.trustServerCertificate, appName: "tools-portal auto-emails" },
  };
}

const g = globalThis as unknown as { __autoEmailPool?: { key: string; pool: Promise<sql.ConnectionPool> } };

async function getPool(s: AutoEmailSettings["sql"]): Promise<sql.ConnectionPool> {
  const key = JSON.stringify([s.server, s.port, s.database, s.encUser, s.encPassword, s.encrypt, s.trustServerCertificate]);
  if (g.__autoEmailPool?.key !== key) {
    const old = g.__autoEmailPool;
    g.__autoEmailPool = { key, pool: new sql.ConnectionPool(poolConfig(s)).connect() };
    if (old) void old.pool.then((p) => p.close()).catch(() => {});
    g.__autoEmailPool.pool.catch(() => {
      if (g.__autoEmailPool?.key === key) g.__autoEmailPool = undefined; // retry the connection next time
    });
  }
  try {
    return await g.__autoEmailPool.pool;
  } catch (err) {
    throw new Error(`Couldn't connect to SQL Server ${s.server}: ${(err as Error).message}`);
  }
}

function fromStub(path: string, maxRows: number): SqlResult {
  const data = JSON.parse(readFileSync(path, "utf8")) as { columns: SqlColumn[]; rows: Record<string, SqlValue>[]; error?: string };
  if (data.error) throw new Error(data.error);
  return { columns: data.columns, rows: data.rows.slice(0, maxRows), truncated: data.rows.length > maxRows, ms: 1 };
}

/** Runs a read-only query and returns at most `maxRows` rows (and whether more were available). */
export async function runQuery(s: AutoEmailSettings["sql"], query: string, maxRows: number): Promise<SqlResult> {
  assertReadOnly(query);
  const started = Date.now();
  if (process.env.AUTO_EMAILS_SQL_STUB) return fromStub(process.env.AUTO_EMAILS_SQL_STUB, maxRows);
  const pool = await getPool(s);
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    return await new Promise<SqlResult>((resolve, reject) => {
      const req = new sql.Request(tx);
      req.stream = true;
      const columns: SqlColumn[] = [];
      const rows: Record<string, SqlValue>[] = [];
      let truncated = false, settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ columns, rows, truncated, ms: Date.now() - started });
      };
      req.on("recordset", (cols: Record<string, { name: string; index: number; type?: { declaration?: string } }>) => {
        if (columns.length) return; // only the first result set
        for (const c of Object.values(cols).sort((a, b) => a.index - b.index)) columns.push({ name: c.name, type: c.type?.declaration ?? "" });
      });
      req.on("row", (row: Record<string, unknown>) => {
        if (rows.length >= maxRows) {
          truncated = true;
          req.cancel();
          return;
        }
        rows.push(Object.fromEntries(columns.map((c) => [c.name, normalize(row[c.name])])));
      });
      req.on("error", (err: Error & { code?: string }) => {
        if (truncated && err.code === "ECANCEL") return finish();
        if (!settled) {
          settled = true;
          reject(new Error(`SQL Server: ${err.message}`));
        }
      });
      req.on("done", finish);
      req.query(query);
    });
  } finally {
    await tx.rollback().catch(() => {});
  }
}

/** Checks the connection: server version and current database. */
export async function testConnection(s: AutoEmailSettings["sql"]): Promise<{ version: string; database: string }> {
  if (process.env.AUTO_EMAILS_SQL_STUB) return { version: "SQL stub (AUTO_EMAILS_SQL_STUB)", database: s.database || "stub" };
  const pool = await getPool(s);
  const r = await pool.request().query<{ v: string; db: string }>("SELECT @@VERSION AS v, DB_NAME() AS db");
  const row = r.recordset[0];
  return { version: String(row?.v ?? "").split("\n")[0].trim(), database: String(row?.db ?? "") };
}

/** Closes the pool (e.g. after the credentials change). */
export async function resetSqlPool() {
  const old = g.__autoEmailPool;
  g.__autoEmailPool = undefined;
  if (old) await old.pool.then((p) => p.close()).catch(() => {});
}
