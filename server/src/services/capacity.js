// VEHICLE CAPACITY ENGINE
// Available capacity = total capacity - cargo currently on board.
// Because cargo is picked up and delivered along the route, we also compute the peak load over a stretch of
// the route, so a shipment is only accepted if the truck has room for the WHOLE distance it will travel.
import { round } from '../utils/geo.js';

const active = (c) => c.status !== 'delivered';

export function onboardKg(trip) {
  return (trip.cargo || []).filter((c) => c.status === 'loaded').reduce((s, c) => s + c.weightKg, 0);
}

export function onboardCbm(trip) {
  return (trip.cargo || []).filter((c) => c.status === 'loaded').reduce((s, c) => s + (c.volumeCbm || 0), 0);
}

// Capacity "right now": total - currently loaded.
export function capacityNow(trip, vehicle) {
  const onboard = onboardKg(trip);
  return {
    totalKg: vehicle.capacityKg,
    onboardKg: onboard,
    availableKg: Math.max(0, vehicle.capacityKg - onboard),
    utilisationPct: Math.round((onboard / vehicle.capacityKg) * 100)
  };
}

// Load (kg / cbm) at one position along the route, counting loaded + still-to-be-picked-up cargo.
function loadAt(cargo, km, key) {
  return cargo
    .filter((c) => active(c) && (c.status === 'loaded' || c.fromKm <= km + 0.01) && c.toKm > km + 0.01)
    .reduce((s, c) => s + (c[key] || 0), 0);
}

// Highest load between fromKm and toKm.
export function peakLoad(trip, fromKm, toKm, key = 'weightKg') {
  const cargo = trip.cargo || [];
  const points = new Set([fromKm]);
  cargo.forEach((c) => {
    if (c.fromKm > fromKm && c.fromKm < toKm) points.add(c.fromKm);
    if (c.toKm > fromKm && c.toKm < toKm) points.add(c.toKm);
  });
  let peak = 0;
  for (const km of points) peak = Math.max(peak, loadAt(cargo, km, key));
  return peak;
}

// Can this trip carry `weightKg` (and `volumeCbm`) between two route positions?
export function capacityForSegment(trip, vehicle, fromKm, toKm, weightKg, volumeCbm = 0) {
  const peakKg = peakLoad(trip, fromKm, toKm, 'weightKg');
  const freeKg = Math.max(0, vehicle.capacityKg - peakKg);
  const reasons = [];
  if (weightKg > freeKg) reasons.push(`Only ${round(freeKg)} kg free on this stretch (needs ${weightKg} kg)`);

  let freeCbm = null;
  if (vehicle.capacityCbm > 0 && volumeCbm > 0) {
    freeCbm = Math.max(0, vehicle.capacityCbm - peakLoad(trip, fromKm, toKm, 'volumeCbm'));
    if (volumeCbm > freeCbm) reasons.push(`Only ${round(freeCbm, 1)} m³ free on this stretch (needs ${volumeCbm} m³)`);
  }
  return { fits: reasons.length === 0, freeKg: round(freeKg), freeCbm, peakKg: round(peakKg), reasons };
}

// Capacity timeline across the route - used by the UI to draw how load changes stop by stop.
export function capacityTimeline(trip, vehicle, route) {
  return route.stops.map((stop, i) => {
    const km = route.cum[i];
    const load = i === route.stops.length - 1 ? 0 : loadAt(trip.cargo || [], km, 'weightKg');
    return { stop: stop.name, km: round(km), loadKg: round(load), freeKg: round(vehicle.capacityKg - load) };
  });
}
