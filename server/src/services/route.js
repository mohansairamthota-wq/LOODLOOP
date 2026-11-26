// ROUTE ENGINE
// Knows the planned route (ordered stops), where a point sits along it, and how far it is off the route.
import { haversine, roadKm, pointToSegment, ROAD_FACTOR, round } from '../utils/geo.js';

export const MAX_DEVIATION_KM = 25; // a pickup/drop further than this from the route is not "on the way"
export const AVG_SPEED_KMPH = 45;

export function buildRoute(stops) {
  const legs = [];
  const cum = [0];
  for (let i = 0; i < stops.length - 1; i++) {
    const len = roadKm(stops[i], stops[i + 1]);
    legs.push(len);
    cum.push(cum[i] + len);
  }
  return { stops, legs, cum, totalKm: cum[cum.length - 1] };
}

// Where does a point sit along the route?
// Returns { progressKm, offKm, segIndex, onStop }.
export function locate(route, point) {
  const stopIdx = route.stops.findIndex(
    (s) => point.name && s.name && s.name.toLowerCase() === point.name.toLowerCase()
  );
  if (stopIdx >= 0) {
    return { progressKm: route.cum[stopIdx], offKm: 0, segIndex: Math.min(stopIdx, route.legs.length - 1), onStop: true };
  }
  let best = null;
  for (let i = 0; i < route.legs.length; i++) {
    const { distKm, t } = pointToSegment(point, route.stops[i], route.stops[i + 1]);
    if (!best || distKm < best.distKm) best = { distKm, t, i };
  }
  return {
    progressKm: route.cum[best.i] + best.t * route.legs[best.i],
    offKm: best.distKm * ROAD_FACTOR,
    segIndex: best.i,
    onStop: false
  };
}

// How far along the route is the truck right now?
export function truckProgress(route, trip) {
  if (trip.currentLocation && typeof trip.currentLocation.lat === 'number') {
    return locate(route, { lat: trip.currentLocation.lat, lng: trip.currentLocation.lng }).progressKm;
  }
  return route.cum[Math.min(trip.currentStopIndex || 0, route.cum.length - 1)];
}

export function truckPosition(route, trip) {
  if (trip.currentLocation && typeof trip.currentLocation.lat === 'number') {
    return { lat: trip.currentLocation.lat, lng: trip.currentLocation.lng };
  }
  const s = route.stops[Math.min(trip.currentStopIndex || 0, route.stops.length - 1)];
  return { lat: s.lat, lng: s.lng };
}

// Index of the last stop the truck has reached.
export function lastStopIndex(route, progressKm) {
  let idx = 0;
  for (let i = 0; i < route.cum.length; i++) if (route.cum[i] <= progressKm + 1) idx = i;
  return idx;
}

// Is a shipment (pickup -> drop) compatible with this trip's route?
export function evaluateRoute(route, trip, pickup, drop) {
  const p = locate(route, pickup);
  const d = locate(route, drop);
  const reasons = [];

  if (p.offKm > MAX_DEVIATION_KM) reasons.push(`Pickup is ${round(p.offKm)} km away from the route`);
  if (d.offKm > MAX_DEVIATION_KM) reasons.push(`Drop is ${round(d.offKm)} km away from the route`);
  if (d.progressKm <= p.progressKm + 1) reasons.push('Shipment direction does not match the trip direction');

  const truckKm = trip.status === 'in_transit' ? truckProgress(route, trip) : 0;
  if (trip.status === 'in_transit' && p.progressKm < truckKm - 1) {
    reasons.push('Truck has already passed the pickup point');
  }

  // Extra distance = detour to reach pickup and drop and rejoin the route.
  const deviationKm = round(2 * p.offKm + 2 * d.offKm, 1);
  const shipmentKm = Math.max(0, round(d.progressKm - p.progressKm, 1));
  const routeScore = Math.max(0, Math.round(100 - deviationKm * 2.5));

  const pos = truckPosition(route, trip);
  const toPickupKm = round(roadKm(pos, pickup) , 1);
  const etaMinutes = Math.round((Math.max(0, p.progressKm - truckKm) / AVG_SPEED_KMPH) * 60);

  return {
    compatible: reasons.length === 0,
    reasons,
    pickupProgressKm: round(p.progressKm, 1),
    dropProgressKm: round(d.progressKm, 1),
    pickupOffKm: round(p.offKm, 1),
    dropOffKm: round(d.offKm, 1),
    deviationKm,
    shipmentKm,
    routeScore,
    truckToPickupKm: toPickupKm,
    etaToPickupMinutes: etaMinutes
  };
}

export { haversine };
