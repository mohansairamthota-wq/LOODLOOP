// Geometry helpers. Distances are in kilometres.
export const ROAD_FACTOR = 1.25; // straight-line -> approximate road distance

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const roadKm = (a, b) => haversine(a, b) * ROAD_FACTOR;

// Distance from point p to segment a-b using a local flat projection (fine for ~500 km spans).
// Returns { distKm (straight line), t (0..1 position along the segment) }.
export function pointToSegment(p, a, b) {
  const lat0 = toRad((a.lat + b.lat) / 2);
  const proj = (q) => ({ x: q.lng * Math.cos(lat0) * 111.32, y: q.lat * 110.57 });
  const P = proj(p);
  const A = proj(a);
  const B = proj(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  return { distKm: Math.hypot(P.x - cx, P.y - cy), t };
}

export const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
