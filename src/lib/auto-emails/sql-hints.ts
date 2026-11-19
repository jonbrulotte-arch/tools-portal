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
export function connectionHint(message: string, server: string, port: number): string {
  const { host, instance } = splitServer(server);
  const m = message.toLowerCase();
  if (m.includes("login failed")) return "Check the SQL login and password, and that the server allows SQL Server authentication (not only Windows logins).";
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
