// MATCHING ENGINE
// Cargo requirement -> capacity check -> route check -> cargo compatibility -> deviation -> profitability -> recommendation
import { buildRoute, evaluateRoute } from './route.js';
import { capacityForSegment } from './capacity.js';
import { cargoCompatibility } from './compat.js';
import { estimateProfit, profitScore } from './profit.js';

export const LABELS = { RECOMMENDED: 'recommended', CONSIDER: 'consider', AVOID: 'avoid' };

// trip: plain object with .vehicle, .stops, .cargo, .status ...
// shipment: { pickup, drop, weightKg, volumeCbm, category, offeredPrice }
export function evaluateMatch(trip, shipment) {
  const vehicle = trip.vehicle;
  const route = buildRoute(trip.stops);

  const routeRes = evaluateRoute(route, trip, shipment.pickup, shipment.drop);
  const compat = cargoCompatibility(vehicle, shipment, trip.cargo);

  // Capacity is only meaningful if the route check found a valid stretch to travel.
  const capRes = capacityForSegment(
    trip,
    vehicle,
    routeRes.pickupProgressKm,
    Math.max(routeRes.dropProgressKm, routeRes.pickupProgressKm + 1),
    shipment.weightKg,
    shipment.volumeCbm || 0
  );

  const profit = estimateProfit({
    price: shipment.offeredPrice,
    deviationKm: routeRes.deviationKm,
    shipmentKm: routeRes.shipmentKm,
    weightKg: shipment.weightKg,
    costPerKm: trip.costPerKm,
    tollPerKm: trip.tollPerKm
  });

  const reasons = [...routeRes.reasons, ...capRes.reasons, ...compat.reasons];
  const feasible = routeRes.compatible && capRes.fits && compat.compatible;

  // Capacity comfort: how much spare room is left after this shipment.
  const capacityScore = capRes.fits
    ? Math.round(60 + 40 * Math.min(1, (capRes.freeKg - shipment.weightKg) / Math.max(1, capRes.freeKg)))
    : 0;
  const pScore = profitScore(profit.netProfit, shipment.offeredPrice);
  const compatScore = compat.compatible ? 100 : 0;

  const score = feasible
    ? Math.round(0.4 * routeRes.routeScore + 0.2 * capacityScore + 0.25 * pScore + 0.15 * compatScore)
    : 0;

  let label = LABELS.AVOID;
  if (feasible && profit.netProfit > 0) {
    if (score >= 75 && routeRes.deviationKm <= 10) label = LABELS.RECOMMENDED;
    else if (score >= 50) label = LABELS.CONSIDER;
  }
  if (feasible && profit.netProfit <= 0) reasons.push('Estimated profit is not positive');

  return {
    feasible,
    label,
    score,
    reasons,
    route: routeRes,
    capacity: capRes,
    compatibility: compat,
    profit
  };
}

// For a customer: which trucks can take my shipment? (best first)
export function rankTripsForShipment(trips, shipment, { onlyFeasible = true } = {}) {
  return trips
    .map((trip) => ({ trip, match: evaluateMatch(trip, shipment) }))
    .filter((r) => !onlyFeasible || r.match.feasible)
    .sort((a, b) => b.match.score - a.match.score);
}

// For a driver: which open shipments fit along my journey? (best first)
export function rankShipmentsForTrip(trip, shipments, { limitAvoid = 5 } = {}) {
  const ranked = shipments
    .map((shipment) => ({ shipment, match: evaluateMatch(trip, shipment) }))
    .sort((a, b) => b.match.score - a.match.score || b.match.profit.netProfit - a.match.profit.netProfit);
  const good = ranked.filter((r) => r.match.feasible);
  const bad = ranked.filter((r) => !r.match.feasible).slice(0, limitAvoid);
  return [...good, ...bad];
}
