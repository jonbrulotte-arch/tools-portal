// Pure helpers for the SQL Server connection settings (safe for client components).

/** Well-known ports that are never SQL Server, with what they usually are. */
export const NOT_SQL_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  25: "SMTP mail",
  80: "web (HTTP)",
  135: "Windows RPC",
  139: "Windows file sharing",
  443: "web (HTTPS)",
  445: "Windows file sharing",
  3389: "Remote Desktop",
  5985: "Windows remote management",
};

/** "host\INSTANCE" → host + instance name (the driver then finds the instance's port through SQL Browser). */
export function splitServer(server: string): { host: string; instance: string | null } {
  const [host, ...rest] = server.trim().split("\\");
  const instance = rest.join("\\").trim();
  return { host: host.trim(), instance: instance || null };
}

/** A plain-English next step for a failed connection. */
export function connectionHint(message: string, server: string, port: number, windowsDomain: string | null = null): string {
  const { host, instance } = splitServer(server);
  const m = message.toLowerCase();
  if (m.includes("login failed") && windowsDomain) {
    return `Check the domain (${windowsDomain}), account and password, that the account isn't locked or expired, and that it has a login on this SQL Server (CREATE LOGIN [${windowsDomain}\\account] FROM WINDOWS) with read access to the database.`;
  }
  if (m.includes("login failed")) {
    return 'Check the login and password. If this is a Windows/domain account (one you use with "Windows Authentication" in SSMS), choose "Windows (domain) account" and enter the domain. A SQL login also needs the server to allow SQL Server authentication.';
  }
  if (m.includes("enotfound") || m.includes("getaddrinfo")) return `This server can't look up "${host}". Try its IP address, or ask IT to make the name resolvable from the portal server.`;
  if (instance && (m.includes("port for") || m.includes("instance") || m.includes("timeout") || m.includes("econnrefused"))) {
    return `For a named instance (${instance}) the SQL Browser service on ${host} must be reachable on UDP 1434. Otherwise ask the DBA for the instance's fixed port and enter "${host}" with that port instead.`;
  }
  if (NOT_SQL_PORTS[port]) return `Port ${port} is ${NOT_SQL_PORTS[port]}, not SQL Server. SQL Server normally uses 1433 (ask the DBA if the instance uses another port).`;
  if (m.includes("timeout") || m.includes("etimedout") || m.includes("econnrefused") || m.includes("failed to connect")) {
    return `Check the server name and port (SQL Server normally uses 1433), and that a firewall lets the portal server reach ${host} on TCP ${port}.`;
  }
  if (m.includes("certificate") || m.includes("self signed") || m.includes("ssl") || m.includes("tls")) return 'The server\'s certificate wasn\'t trusted. If it uses a self-signed certificate, turn on "Trust the server\'s certificate".';
  return "";
}

export type PoolStats = { inUse: number; free: number; waiting: number; max: number };
export type SqlErrorContext = { server: string; port: number; windowsDomain: string | null; stage: "connect" | "query"; pool?: PoolStats | null; requestTimeoutS: number; acquireTimeoutS: number };

/** The connection pool gave up waiting for a free connection (tarn's TimeoutError while acquiring). */
export function isPoolTimeout(err: unknown) {
  const e = err as { name?: string; constructor?: { name?: string }; message?: string };
  return e?.constructor?.name === "TimeoutError" || /operation timed out for an unknown reason|resourcerequest timed out/i.test(e?.message ?? "");
}

/**
 * A readable explanation of a SQL Server failure: what happened, what to do, and the driver's code.
 * Replaces messages like the pool's "operation timed out for an unknown reason".
 */
export function describeSqlError(err: unknown, ctx: SqlErrorContext): string {
  const e = err as { message?: string; code?: string; originalError?: { code?: string; message?: string } };
  const code = e?.code ?? e?.originalError?.code;
  const tag = code ? ` [${code}]` : "";
  const message = (e?.message ?? String(err)).trim();
  if (isPoolTimeout(err)) {
    const p = ctx.pool;
    const stats = p ? ` (in use ${p.inUse} of ${p.max}, free ${p.free}, waiting ${p.waiting})` : "";
    return `Couldn't get a SQL Server connection within ${ctx.acquireTimeoutS} s: all connections were busy or stuck${stats}. The connections have been reset, so the next check starts fresh. If this keeps happening, a query may be running longer than ${ctx.requestTimeoutS} s, or SQL Server isn't answering (use Save & test connection in Settings).`;
  }
  if (ctx.stage === "query" && code === "ETIMEOUT") {
    return `The query ran longer than ${ctx.requestTimeoutS} s and was stopped. Narrow its date range or filters, or ask the DBA for an index on the columns it filters by.${tag}`;
  }
  if (ctx.stage === "connect") {
    const hint = connectionHint(message, ctx.server, ctx.port, ctx.windowsDomain);
    return `Couldn't connect to SQL Server ${ctx.server}: ${message}${hint ? ` ${hint}` : ""}${tag}`;
  }
  return `SQL Server: ${message}${tag}`;
}
