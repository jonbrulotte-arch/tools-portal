import { createHash } from "node:crypto";
import type { AutoEmailSettings } from "@/lib/settings";
import { zonedParts } from "@/lib/timezone";
import type { SqlColumn, SqlValue } from "@/lib/auto-emails/sql";

// Builds an automated email: subject (optionally with the send date), intro text, the data as an
// HTML table with inline styles (so Outlook renders it), and closing text. Also identifies rows by
// their key columns so a row is only ever sent once.

export type EmailContent = { subject: string; appendDate: boolean; introText: string; closingText: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The send date in the chosen time zone and format. */
export function formatSendDate(now: Date, s: Pick<AutoEmailSettings, "dateFormat" | "timezone">) {
  const [y, m, d] = zonedParts(now, s.timezone).date.split("-");
  return s.dateFormat === "YYYY-MM-DD" ? `${y}-${m}-${d}` : s.dateFormat === "DD/MM/YYYY" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

export function buildSubject(e: Pick<EmailContent, "subject" | "appendDate">, now: Date, s: Pick<AutoEmailSettings, "dateFormat" | "timezone">) {
  const base = e.subject.trim();
  return e.appendDate ? `${base} - ${formatSendDate(now, s)}` : base;
}

/** Plain text → paragraphs (blank lines) and line breaks, escaped. */
export function textToHtml(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 12px 0">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/**
 * A cell as text. SQL dates arrive as UTC ISO strings holding the database's own wall-clock time,
 * so they're shown as-is (no time-zone shift); midnight values show as a date only.
 */
export function formatCell(v: SqlValue, s: Pick<AutoEmailSettings, "dateFormat">) {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    const m = v.match(ISO);
    if (m) {
      const [, y, mo, d, h, mi, sec] = m;
      const date = s.dateFormat === "YYYY-MM-DD" ? `${y}-${mo}-${d}` : s.dateFormat === "DD/MM/YYYY" ? `${d}/${mo}/${y}` : `${mo}/${d}/${y}`;
      return h === "00" && mi === "00" && sec === "00" ? date : `${date} ${h}:${mi}`;
    }
    return v;
  }
  return String(v);
}

export function buildTable(columns: SqlColumn[], rows: Record<string, SqlValue>[], s: Pick<AutoEmailSettings, "dateFormat">) {
  const th = "border:1px solid #d1d5db;background:#f3f4f6;padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap";
  const td = "border:1px solid #e5e7eb;padding:6px 10px;vertical-align:top";
  const head = columns.map((c) => `<th style="${th}">${esc(c.name)}</th>`).join("");
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td style="${td}">${esc(formatCell(r[c.name] ?? null, s))}</td>`).join("")}</tr>`).join("\n");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:13px;margin:4px 0 16px 0"><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

export function buildEmail(e: EmailContent, columns: SqlColumn[], rows: Record<string, SqlValue>[], now: Date, s: Pick<AutoEmailSettings, "dateFormat" | "timezone">) {
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.5">
${textToHtml(e.introText)}
${buildTable(columns, rows, s)}
${textToHtml(e.closingText)}
</div>`;
  return { subject: buildSubject(e, now, s), html };
}

/** A row's identity: a hash of its key-column values (and a short readable form for the log). */
export function keyOf(row: Record<string, SqlValue>, keyColumns: string[]) {
  const values = keyColumns.map((c) => {
    const v = row[c];
    return v == null ? null : typeof v === "string" ? v.trim() : v;
  });
  return {
    hash: createHash("sha256").update(JSON.stringify(values)).digest("hex"),
    text: keyColumns.map((c, i) => `${c} ${values[i] ?? "(blank)"}`).join(" · ").slice(0, 300),
  };
}

/** Throws if any key column isn't in the query's results (names compared case-insensitively). */
export function resolveKeyColumns(columns: SqlColumn[], keyColumns: string[]): string[] {
  if (!keyColumns.length) throw new Error("Choose at least one key column (the column(s) that identify a record).");
  return keyColumns.map((k) => {
    const hit = columns.find((c) => c.name.toLowerCase() === k.toLowerCase());
    if (!hit) throw new Error(`Key column "${k}" isn't in the query's results (columns: ${columns.map((c) => c.name).join(", ") || "none"}).`);
    return hit.name;
  });
}
