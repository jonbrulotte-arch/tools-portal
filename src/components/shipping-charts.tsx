"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Fixed series colours (validated palette slots 1–3). Identity follows the carrier/service everywhere;
// UPS residential is also dashed, so lines never rely on colour alone.
export const SERIES = { usps: "#2a78d6", upsCom: "#eb6834", upsRes: "#1baf7a" } as const;
const AXIS = { stroke: "#d1d5db", tick: { fill: "#6b7280", fontSize: 12 } };
const usd = (v: unknown) => (typeof v === "number" ? `$${v.toFixed(2)}` : String(v));

export function ZoneUsageChart({ data }: { data: { zone: number; ups: number; usps: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((d) => ({ ...d, label: `Zone ${d.zone}` }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="label" {...AXIS} tickLine={false} />
          <YAxis {...AXIS} tickLine={false} axisLine={false} width={48} />
          <Tooltip cursor={{ fill: "#f9fafb" }} formatter={(v) => (typeof v === "number" ? v.toLocaleString() : String(v))} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="ups" name="UPS Ground" stackId="z" fill={SERIES.upsCom} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="usps" name="USPS Ground Advantage" stackId="z" fill={SERIES.usps} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RateCurveChart({
  points,
  cutoffCom,
  cutoffRes,
}: {
  points: { label: string; usps: number | null; upsCom: number | null; upsRes: number | null }[];
  cutoffCom: string | null;
  cutoffRes: string | null;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="label" {...AXIS} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `$${v}`} />
          <Tooltip formatter={(v) => usd(v)} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {cutoffCom && (
            <ReferenceLine x={cutoffCom} stroke={SERIES.upsCom} strokeDasharray="4 4" label={{ value: `UPS commercial cheaper from ${cutoffCom}`, position: "insideTopLeft", fill: "#374151", fontSize: 11 }} />
          )}
          {cutoffRes && cutoffRes !== cutoffCom && (
            <ReferenceLine x={cutoffRes} stroke={SERIES.upsRes} strokeDasharray="4 4" label={{ value: `residential from ${cutoffRes}`, position: "insideBottomLeft", fill: "#374151", fontSize: 11 }} />
          )}
          <Line type="monotone" dataKey="usps" name="USPS Ground Advantage" stroke={SERIES.usps} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
          <Line type="monotone" dataKey="upsCom" name="UPS Ground (commercial)" stroke={SERIES.upsCom} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
          <Line type="monotone" dataKey="upsRes" name="UPS Ground (residential)" stroke={SERIES.upsRes} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The validated categorical palette (fixed order). An account's colour comes from its slot, never its rank. */
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;
export const OTHER_COLOR = "#9ca3af";
export const slotColor = (slot: number) => CATEGORICAL[slot] ?? OTHER_COLOR;

/** Rate requests per day, stacked by account. Estimated days (from stored runs) are drawn faded. */
export function ApiUsageChart({ data, series }: { data: Record<string, string | number | boolean>[]; series: { key: string; name: string; color: string }[] }) {
  const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="day" {...AXIS} tickLine={false} tickFormatter={label} minTickGap={16} />
          <YAxis {...AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => v.toLocaleString()} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "#f9fafb" }}
            labelFormatter={(d) => {
              const point = data.find((p) => p.day === d);
              return `${label(String(d))}${point?.estimated ? " (estimated)" : ""}`;
            }}
            formatter={(v, name) => [typeof v === "number" ? v.toLocaleString() : String(v), name]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "#374151" }}>{v}</span>} />
          {series.map((sr, i) => (
            <Bar key={sr.key} dataKey={sr.key} name={sr.name} stackId="d" fill={sr.color} stroke="#fff" strokeWidth={1} radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={String(d.day)} fillOpacity={d.estimated ? 0.45 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
