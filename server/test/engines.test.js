import test from 'node:test';
import assert from 'node:assert/strict';
import { findCity } from '../src/data/cities.js';
import { buildRoute, locate } from '../src/services/route.js';
import { onboardKg, capacityNow, capacityForSegment } from '../src/services/capacity.js';
import { estimateProfit } from '../src/services/profit.js';
import { evaluateMatch } from '../src/services/matching.js';
import { cargoCompatibility } from '../src/services/compat.js';

const city = (n) => findCity(n);
const stops = ['Eluru', 'Vijayawada', 'Guntur', 'Hyderabad'].map(city);
const route = buildRoute(stops);
const km = (n) => route.cum[stops.findIndex((s) => s.name === n)];

const vehicle = { type: 'container', capacityKg: 5000, capacityCbm: 0 };

function makeTrip(cargo = []) {
  return { vehicle, stops, status: 'planned', cargo, costPerKm: 14, tollPerKm: 2.5, currentStopIndex: 0 };
}

// The example from the project brief: 5,000 kg truck carrying 3,000 kg
const baseCargo = () => [
  { label: 'Electronics', category: 'electronics', weightKg: 2000, fromKm: 0, toKm: km('Hyderabad'), status: 'loaded' },
  { label: 'General', category: 'general', weightKg: 1000, fromKm: 0, toKm: km('Hyderabad'), status: 'loaded' }
];

test('available capacity = total capacity - cargo on board (and it changes dynamically)', () => {
  const trip = makeTrip(baseCargo());
  assert.equal(onboardKg(trip), 3000);
  assert.equal(capacityNow(trip, vehicle).availableKg, 2000);

  // driver picks up another 800 kg
  trip.cargo.push({ label: 'Extra', weightKg: 800, fromKm: km('Vijayawada'), toKm: km('Guntur'), status: 'loaded' });
  assert.equal(capacityNow(trip, vehicle).availableKg, 1200);

  // delivers 1,000 kg of general goods
  trip.cargo.find((c) => c.label === 'General').status = 'delivered';
  assert.equal(capacityNow(trip, vehicle).availableKg, 2200);
});

test('capacity is checked over the whole stretch, not just right now', () => {
  const trip = makeTrip(baseCargo());
  // 1,500 kg Vijayawada -> Guntur fits in 2,000 kg free
  assert.ok(capacityForSegment(trip, vehicle, km('Vijayawada'), km('Guntur'), 1500).fits);
  // but not once a 1,000 kg load is waiting to be picked up at Vijayawada going to Hyderabad
  trip.cargo.push({ label: 'Waiting', weightKg: 1000, fromKm: km('Vijayawada'), toKm: km('Hyderabad'), status: 'waiting' });
  const res = capacityForSegment(trip, vehicle, km('Vijayawada'), km('Guntur'), 1500);
  assert.equal(res.fits, false);
  assert.equal(res.freeKg, 1000);
});

test('route engine: stops and nearby points sit on the route, far points do not', () => {
  assert.equal(locate(route, city('Guntur')).offKm, 0);
  assert.ok(locate(route, city('Rajahmundry')).offKm > 25);
  const nuzvid = locate(route, city('Nuzvid')); // close to the Eluru-Vijayawada stretch
  assert.ok(nuzvid.offKm > 0 && nuzvid.offKm < 25);
});

test('profit engine: net profit = revenue - commission - extra costs', () => {
  const p = estimateProfit({ price: 1500, deviationKm: 5, shipmentKm: 100, weightKg: 1000, costPerKm: 14, tollPerKm: 2.5 });
  assert.equal(p.revenue, 1500);
  assert.equal(p.commission, 75);
  // deviation 70 + load fuel 200 + toll 12.5 + handling 50 = 332.5 (rounded 333)
  assert.ok(Math.abs(p.extraCosts - 333) <= 1);
  assert.ok(p.netProfit > 1000 && p.netProfit < 1100);
});

test('matching: the three intermediate shipments from the brief all fit; Eluru -> Rajahmundry does not', () => {
  const trip = makeTrip(baseCargo());
  const mk = (a, b, w, price) => ({ pickup: city(a), drop: city(b), weightKg: w, category: 'general', offeredPrice: price });

  const A = evaluateMatch(trip, mk('Eluru', 'Vijayawada', 500, 900));
  const B = evaluateMatch(trip, mk('Vijayawada', 'Guntur', 700, 900));
  const C = evaluateMatch(trip, mk('Guntur', 'Hyderabad', 500, 1500));
  for (const m of [A, B, C]) {
    assert.equal(m.feasible, true);
    assert.equal(m.route.deviationKm, 0);
    assert.equal(m.label, 'recommended');
    assert.ok(m.profit.netProfit > 0);
  }

  const D = evaluateMatch(trip, mk('Eluru', 'Rajahmundry', 500, 900));
  assert.equal(D.feasible, false);
  assert.equal(D.label, 'avoid');
});

test('matching: too heavy a shipment is rejected on capacity', () => {
  const trip = makeTrip(baseCargo());
  const m = evaluateMatch(trip, { pickup: city('Eluru'), drop: city('Guntur'), weightKg: 2500, category: 'general', offeredPrice: 5000 });
  assert.equal(m.feasible, false);
  assert.match(m.reasons.join(' '), /free/);
});

test('matching: wrong direction (return leg against the trip) is rejected', () => {
  const trip = makeTrip(baseCargo());
  const m = evaluateMatch(trip, { pickup: city('Hyderabad'), drop: city('Eluru'), weightKg: 100, category: 'general', offeredPrice: 900 });
  assert.equal(m.feasible, false);
  assert.match(m.reasons.join(' '), /direction/);
});

test('cargo compatibility: perishables need a reefer; hazardous cannot mix with food', () => {
  assert.equal(cargoCompatibility(vehicle, { category: 'food_perishable' }, []).compatible, false);
  assert.equal(cargoCompatibility({ type: 'refrigerated' }, { category: 'food_perishable' }, []).compatible, true);
  assert.equal(
    cargoCompatibility({ type: 'closed' }, { category: 'hazardous' }, [{ category: 'fmcg', status: 'loaded' }]).compatible,
    false
  );
});

test('return trip: a reversed route accepts the return-direction shipment', () => {
  const rev = [...stops].reverse();
  const trip = { vehicle, stops: rev, status: 'planned', cargo: [], costPerKm: 14, tollPerKm: 2.5, currentStopIndex: 0 };
  const m = evaluateMatch(trip, { pickup: city('Hyderabad'), drop: city('Eluru'), weightKg: 3000, category: 'general', offeredPrice: 6000 });
  assert.equal(m.feasible, true);
  assert.equal(m.label, 'recommended');
});
