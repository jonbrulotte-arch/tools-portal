import geo from "./us-geo.json";

// Distance-based zone estimates for the 48 contiguous states.
// Carrier zones follow distance, but each origin's real boundaries differ from the textbook
// bands (e.g. Las Vegas → Los Angeles is ~230 mi yet zone 4). So a report "learns" each
// origin's boundaries from its UPS invoices (fitZoneBands) and uses those; the textbook bands
// are only the fallback. Centroids come from GeoNames, so estimates can be one zone off.

export type LatLon = [number, number];
/** Upper distance (miles) of zones 2–7; anything beyond the zone-7 bound is zone 8. */
export type ZoneBands = Record<number, number>;
const data = geo as unknown as { zips: Record<string, LatLon>; cities: Record<string, LatLon>; states: Record<string, LatLon> };

/** States/territories outside the zone 2–8 ground network this tool analyses. */
export const NON_CONTIGUOUS = new Set(["AK", "HI", "PR", "VI", "GU", "AS", "MP", "FM", "MH", "PW", "AA", "AE", "AP"]);

/** Textbook bands (zone 1 folds into 2). */
export const DEFAULT_BANDS: ZoneBands = { 2: 150, 3: 300, 4: 600, 5: 1000, 6: 1400, 7: 1800 };

export function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function zoneForDistance(miles: number, bands: ZoneBands = DEFAULT_BANDS): number {
  for (let z = 2; z <= 7; z++) if (miles <= bands[z]) return z;
  return 8;
}

/**
 * Learn an origin's zone boundaries from shipments whose real zone is known: for each boundary,
 * the distance that misclassifies the fewest shipments. Needs enough data to be meaningful.
 */
export function fitZoneBands(pairs: { miles: number; zone: number }[], minSamples = 200): ZoneBands | null {
  if (pairs.length < minSamples) return null;
  const pts = [...pairs].sort((a, b) => a.miles - b.miles);
  const bands: ZoneBands = {};
  let prev = 0;
  for (let z = 2; z <= 7; z++) {
    let err = pts.filter((p) => p.zone <= z).length; // threshold below every point
    let best = { err, miles: 0 };
    for (const p of pts) {
      err += p.zone <= z ? -1 : 1;
      if (err < best.err) best = { err, miles: p.miles };
    }
    bands[z] = Math.round(Math.max(prev, best.miles));
    prev = bands[z];
  }
  return bands;
}

/** The ZIP whose centroid is nearest a point. */
export function nearestZip(point: LatLon): string | null {
  let best: { zip: string; d: number } | null = null;
  for (const [zip, p] of Object.entries(data.zips)) {
    const d = Math.abs(p[0] - point[0]) + Math.abs(p[1] - point[1]);
    if (!best || d < best.d) best = { zip, d };
  }
  return best?.zip ?? null;
}

export function zipPoint(zip: string): LatLon | null {
  return data.zips[zip.slice(0, 5)] ?? null;
}

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bHTS\b/g, "HEIGHTS"],
  [/\bMT\b/g, "MOUNT"],
  [/\bFT\b/g, "FORT"],
  [/\bPT\b/g, "POINT"],
  [/\bSPGS\b/g, "SPRINGS"],
  [/\bSPG\b/g, "SPRING"],
  [/\bVLG\b/g, "VILLAGE"],
  [/\bTWP\b/g, "TOWNSHIP"],
  [/\bJCT\b/g, "JUNCTION"],
  [/\bCTR\b/g, "CENTER"],
  [/\bN\b/g, "NORTH"],
  [/\bS\b/g, "SOUTH"],
  [/\bE\b/g, "EAST"],
  [/\bW\b/g, "WEST"],
];

/** Coordinates for a destination city/state; falls back to the state centroid (less precise). */
export function cityPoint(city: string, state: string): { point: LatLon; precision: "city" | "state" } | null {
  const st = state.trim().toUpperCase();
  const raw = city.trim().toUpperCase().replace(/[.,']/g, "").replace(/\s+/g, " ");
  const candidates = [raw];
  let expanded = raw;
  for (const [re, full] of ABBREVIATIONS) expanded = expanded.replace(re, full);
  if (expanded !== raw) candidates.push(expanded);
  if (/^ST /.test(raw)) candidates.push(raw.replace(/^ST /, "SAINT "));
  for (const c of candidates) {
    const p = data.cities[`${c}|${st}`];
    if (p) return { point: p, precision: "city" };
  }
  const s = data.states[st];
  return s ? { point: s, precision: "state" } : null;
}

/** Estimated zone from an origin ZIP to a destination city/state (null when unknown or outside zones 2–8). */
export function estimateZone(originZip: string, city: string, state: string, bands?: ZoneBands): { zone: number; precision: "city" | "state" } | null {
  if (NON_CONTIGUOUS.has(state.trim().toUpperCase())) return null;
  const o = zipPoint(originZip);
  const d = cityPoint(city, state);
  if (!o || !d) return null;
  return { zone: zoneForDistance(distanceMiles(o, d.point), bands), precision: d.precision };
}

/**
 * A representative destination ZIP for each zone 2–8 from an origin: the contiguous-US ZIP
 * closest to the middle of the zone's distance band. Used to request quotes per zone.
 */
export function representativeZips(originZip: string, bands: ZoneBands = DEFAULT_BANDS): Record<number, string> {
  const o = zipPoint(originZip);
  if (!o) return {};
  const targets: Record<number, number> = { 8: bands[7] + 300 };
  for (let z = 2; z <= 7; z++) targets[z] = ((z === 2 ? 0 : bands[z - 1]) + bands[z]) / 2;
  const best: Record<number, { zip: string; diff: number }> = {};
  for (const [zip, p] of Object.entries(data.zips)) {
    // contiguous US only (rough bounding box), and skip PO-box-only / military ranges by sticking to normal ZIPs
    if (p[0] < 24.4 || p[0] > 49.5 || p[1] < -125 || p[1] > -66.8) continue;
    const miles = distanceMiles(o, p);
    const zone = zoneForDistance(miles, bands);
    const diff = Math.abs(miles - targets[zone]);
    if (!best[zone] || diff < best[zone].diff) best[zone] = { zip, diff };
  }
  return Object.fromEntries(Object.entries(best).map(([z, v]) => [Number(z), v.zip]));
}
