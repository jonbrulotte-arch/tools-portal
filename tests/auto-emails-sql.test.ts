import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { describeSqlError, isPoolTimeout } from "@/lib/auto-emails/sql-hints";

// ─── describeSqlError ────────────────────────────────────────────────────────

class TimeoutError extends Error {} // the pool library's error class name
const ctx = { server: "10.150.10.53", port: 1433, windowsDomain: null, requestTimeoutS: 60, acquireTimeoutS: 30 };

describe("SQL error messages", () => {
  it("explains the pool's 'operation timed out for an unknown reason'", () => {
    const err = new TimeoutError("operation timed out for an unknown reason");
    expect(isPoolTimeout(err)).toBe(true);
    expect(describeSqlError(err, { ...ctx, stage: "connect", pool: { inUse: 3, free: 0, waiting: 1, max: 3 } })).toBe(
      "Couldn't get a SQL Server connection within 30 s: all connections were busy or stuck (in use 3 of 3, free 0, waiting 1). The connections have been reset, so the next check starts fresh. If this keeps happening, a query may be running longer than 60 s, or SQL Server isn't answering (use Save & test connection in Settings).",
    );
  });
  it("explains a query timeout and keeps the driver's code", () => {
    expect(describeSqlError(Object.assign(new Error("Timeout: Request failed to complete in 60000ms"), { code: "ETIMEOUT" }), { ...ctx, stage: "query" })).toMatch(/^The query ran longer than 60 s and was stopped\. .*\[ETIMEOUT\]$/);
  });
  it("adds the connection hint and code to connect failures, and the code to query errors", () => {
    expect(describeSqlError(Object.assign(new Error("Login failed for user 'jlowell'."), { code: "ELOGIN" }), { ...ctx, stage: "connect" })).toMatch(/^Couldn't connect to SQL Server 10\.150\.10\.53: Login failed for user 'jlowell'\. Check the login and password\..*\[ELOGIN\]$/);
    expect(describeSqlError(Object.assign(new Error("Invalid column name 'Foo'."), { code: "EREQUEST" }), { ...ctx, stage: "query" })).toBe("SQL Server: Invalid column name 'Foo'. [EREQUEST]");
  });
});

// ─── no leaked connections (mssql faked) ─────────────────────────────────────

type Script = (req: FakeRequest) => void;
const state = { pools: 0, rollbacks: 0, rollbackRefused: 0, closed: 0, beginError: null as Error | null, script: null as Script | null };

class FakeRequest extends EventEmitter {
  stream = false;
  active = true;
  constructor(public tx: FakeTx) {
    super();
    tx.activeRequest = this;
  }
  cancel() {
    setImmediate(() => this.finish(Object.assign(new Error("Canceled."), { code: "ECANCEL" })));
  }
  /** Like mssql: release the request, emit the final error (if any), then "done". */
  finish(err?: Error) {
    if (!this.active) return;
    this.active = false;
    this.tx.activeRequest = null;
    if (err) this.emit("error", err);
    this.emit("done", {});
  }
  query() {
    setImmediate(() => state.script!(this));
  }
}
class FakeTx {
  activeRequest: FakeRequest | null = null;
  constructor(public pool: FakePool) {}
  async begin() {
    if (state.beginError) throw state.beginError;
  }
  async rollback() {
    if (this.activeRequest) {
      state.rollbackRefused++;
      throw Object.assign(new Error("Can't rollback transaction. There is a request in progress."), { code: "EREQINPROG" });
    }
    state.rollbacks++;
  }
}
class FakePool {
  borrowed = 3;
  available = 0;
  pending = 1;
  constructor() {
    state.pools++;
  }
  async connect() {
    return this;
  }
  async close() {
    state.closed++;
  }
}
vi.mock("mssql", () => ({ default: { ConnectionPool: FakePool, Transaction: FakeTx, Request: FakeRequest, ISOLATION_LEVEL: { READ_COMMITTED: 1 } } }));

describe("runQuery never leaks a connection", async () => {
  const { encrypt } = await import("@/lib/crypto");
  const { runQuery, resetSqlPool } = await import("@/lib/auto-emails/sql");
  const s = { server: "sql01", port: 1433, database: "EDI", authType: "sql" as const, domain: "", encUser: encrypt("u"), encPassword: encrypt("p"), encrypt: true, trustServerCertificate: true };
  const cols = { a: { name: "PO", index: 0, type: { declaration: "varchar" } } };

  beforeEach(async () => {
    await resetSqlPool();
    Object.assign(state, { pools: 0, rollbacks: 0, rollbackRefused: 0, closed: 0, beginError: null, script: null });
  });

  it("waits for the request to finish after a SQL error mid-stream, then rolls back", async () => {
    // SQL Server reports the error while the request is still running; it finishes a moment later
    state.script = (req) => {
      req.emit("error", Object.assign(new Error("Invalid column name 'Foo'."), { code: "EREQUEST" }));
      setTimeout(() => req.finish(), 20);
    };
    await expect(runQuery(s, "SELECT Foo FROM T", 100)).rejects.toThrow("SQL Server: Invalid column name 'Foo'. [EREQUEST]");
    expect(state).toMatchObject({ rollbacks: 1, rollbackRefused: 0, closed: 0 });
  });

  it("returns rows, and rolls back cleanly when cut off at the row limit", async () => {
    state.script = (req) => {
      req.emit("recordset", cols);
      for (let i = 0; i < 5; i++) req.emit("row", { PO: `P${i}` });
    };
    const r = await runQuery(s, "SELECT PO FROM T", 2);
    expect(r).toMatchObject({ truncated: true, columns: [{ name: "PO", type: "varchar" }] });
    expect(r.rows).toEqual([{ PO: "P0" }, { PO: "P1" }]);
    expect(state).toMatchObject({ rollbacks: 1, rollbackRefused: 0 });
  });

  it("resets the pool when no connection is free, with a readable message", async () => {
    state.script = (req) => req.finish();
    await runQuery(s, "SELECT 1", 1); // creates the pool
    state.beginError = new TimeoutError("operation timed out for an unknown reason");
    await expect(runQuery(s, "SELECT 1", 1)).rejects.toThrow(/^Couldn't get a SQL Server connection within 30 s: all connections were busy or stuck \(in use 3 of 3, free 0, waiting 1\)/);
    expect(state.closed).toBeGreaterThan(0); // the stuck pool was closed…
    state.beginError = null;
    const before = state.pools;
    await runQuery(s, "SELECT 1", 1);
    expect(state.pools).toBe(before + 1); // …and the next run made a new one
  });
});
