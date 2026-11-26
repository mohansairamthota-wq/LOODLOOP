import { Router } from 'express';
import { Trip, Vehicle, Shipment } from '../models/index.js';
import { requireAuth, optionalAuth, wrap, HttpError } from '../middleware/auth.js';
import { resolvePlace } from '../data/cities.js';
import { buildRoute, locate, truckProgress, lastStopIndex } from '../services/route.js';
import { peakLoad } from '../services/capacity.js';
import { rankShipmentsForTrip } from '../services/matching.js';
import { pickupCargo, deliverCargo } from '../services/cargoFlow.js';
import { tripView, shipmentView } from '../services/views.js';

const router = Router();

const populate = (q) => q.populate('vehicle').populate('driver', 'name phone verified');

async function ownTrip(req) {
  const trip = await populate(Trip.findById(req.params.id));
  if (!trip) throw new HttpError(404, 'Trip not found');
  if (String(trip.driver._id) !== String(req.user._id)) throw new HttpError(403, 'This is not your trip');
  return trip;
}

function buildCargoItems(route, items = [], tripStart) {
  return items.map((c) => {
    const from = resolvePlace(c.from) || route.stops[0];
    const to = resolvePlace(c.to) || route.stops[route.stops.length - 1];
    const fromKm = locate(route, from).progressKm;
    const toKm = locate(route, to).progressKm;
    if (toKm <= fromKm) throw new HttpError(400, `Cargo "${c.label}" must be delivered after it is picked up`);
    return {
      label: c.label || 'Cargo',
      category: c.category || 'general',
      weightKg: Number(c.weightKg),
      volumeCbm: Number(c.volumeCbm) || 0,
      fromName: from.name,
      toName: to.name,
      fromKm,
      toKm,
      special: c.special || [],
      notes: c.notes,
      // cargo that starts at the first stop is already on the truck at departure
      status: c.status || (from.name === tripStart.name ? 'loaded' : 'waiting')
    };
  });
}

/* ---------- Create a trip (optionally with its return trip) ---------- */
router.post(
  '/',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const { vehicleId, stops: stopNames, departureTime, baseEarnings, costPerKm, tollPerKm, existingCargo, createReturn } = req.body;
    const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: req.user._id });
    if (!vehicle) throw new HttpError(400, 'Choose one of your vehicles');

    const stops = (stopNames || []).map(resolvePlace);
    if (stops.length < 2 || stops.some((s) => !s)) throw new HttpError(400, 'Give at least two valid stops (source and destination)');
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].name === stops[i - 1].name) throw new HttpError(400, 'Consecutive stops must be different');
    }

    const route = buildRoute(stops);
    const cargo = buildCargoItems(route, existingCargo, stops[0]);
    const draft = { cargo };
    const overload = peakLoad(draft, 0, route.totalKm, 'weightKg');
    if (overload > vehicle.capacityKg) throw new HttpError(400, `Cargo (${overload} kg) is more than the vehicle capacity (${vehicle.capacityKg} kg)`);

    const trip = await Trip.create({
      driver: req.user._id,
      vehicle: vehicle._id,
      stops,
      departureTime: departureTime ? new Date(departureTime) : undefined,
      baseEarnings: Number(baseEarnings) || 0,
      costPerKm: Number(costPerKm) || 14,
      tollPerKm: Number(tollPerKm) || 2.5,
      cargo
    });

    let returnTrip = null;
    if (createReturn) returnTrip = await makeReturnTrip(trip);

    const full = await populate(Trip.findById(trip._id));
    res.status(201).json({ trip: tripView(full, req.user), returnTrip: returnTrip ? { id: String(returnTrip._id) } : null });
  })
);

async function makeReturnTrip(trip) {
  return Trip.create({
    driver: trip.driver,
    vehicle: trip.vehicle,
    stops: [...trip.stops].reverse().map((s) => ({ name: s.name, lat: s.lat, lng: s.lng })),
    costPerKm: trip.costPerKm,
    tollPerKm: trip.tollPerKm,
    isReturn: true,
    returnOf: trip._id,
    cargo: [] // empty on the way back - this is the return-load opportunity
  });
}

/* ---------- Driver's own trips ---------- */
router.get(
  '/mine',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trips = await populate(Trip.find({ driver: req.user._id }).sort('-createdAt'));
    res.json(trips.map((t) => tripView(t, req.user)));
  })
);

/* ---------- One trip (visibility depends on who is asking) ---------- */
router.get(
  '/:id',
  optionalAuth,
  wrap(async (req, res) => {
    const trip = await populate(Trip.findById(req.params.id));
    if (!trip) throw new HttpError(404, 'Trip not found');
    res.json(tripView(trip, req.user));
  })
);

/* ---------- Return trip ---------- */
router.post(
  '/:id/return',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    const existing = await Trip.findOne({ returnOf: trip._id });
    if (existing) throw new HttpError(409, 'A return trip already exists for this trip');
    const rt = await makeReturnTrip(trip);
    res.status(201).json({ id: String(rt._id) });
  })
);

/* ---------- Trip lifecycle ---------- */
router.post(
  '/:id/start',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    if (trip.status !== 'planned') throw new HttpError(400, 'Trip has already started');
    trip.status = 'in_transit';
    trip.currentStopIndex = 0;
    trip.currentLocation = { lat: trip.stops[0].lat, lng: trip.stops[0].lng, updatedAt: new Date() };
    await trip.save();
    res.json(tripView(trip, req.user));
  })
);

router.post(
  '/:id/complete',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    if (trip.cargo.some((c) => c.status !== 'delivered')) {
      throw new HttpError(400, 'Deliver all cargo before completing the trip');
    }
    trip.status = 'completed';
    await trip.save();
    res.json(tripView(trip, req.user));
  })
);

router.post(
  '/:id/cancel',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    if (trip.status !== 'planned') throw new HttpError(400, 'Only planned trips can be cancelled');
    if (trip.cargo.some((c) => c.booking && c.status !== 'delivered')) {
      throw new HttpError(400, 'This trip has customer bookings - reject or deliver them first');
    }
    trip.status = 'cancelled';
    await trip.save();
    res.json(tripView(trip, req.user));
  })
);

/* ---------- Live location (GPS from the driver's phone, or the simulator in the UI) ---------- */
router.patch(
  '/:id/location',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    if (trip.status !== 'in_transit') throw new HttpError(400, 'Start the trip first');
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') throw new HttpError(400, 'lat and lng must be numbers');
    trip.currentLocation = { lat, lng, updatedAt: new Date() };
    trip.currentStopIndex = lastStopIndex(buildRoute(trip.stops), truckProgress(buildRoute(trip.stops), trip.toObject()));
    await trip.save();
    res.json(tripView(trip, req.user));
  })
);

/* ---------- Cargo on a trip ---------- */
router.post(
  '/:id/cargo',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    const route = buildRoute(trip.stops);
    const [item] = buildCargoItems(route, [req.body], trip.stops[0]);
    const draft = { cargo: [...trip.cargo.map((c) => c.toObject()), item] };
    if (peakLoad(draft, item.fromKm, item.toKm) > trip.vehicle.capacityKg) {
      throw new HttpError(400, 'Adding this cargo would exceed the vehicle capacity');
    }
    if (trip.status === 'in_transit' && item.status === 'loaded') {
      // loaded right now: make sure the truck really has the space
      const onboard = trip.cargo.filter((c) => c.status === 'loaded').reduce((s, c) => s + c.weightKg, 0);
      if (onboard + item.weightKg > trip.vehicle.capacityKg) throw new HttpError(400, 'Not enough free space on board');
    }
    trip.cargo.push(item);
    await trip.save();
    res.status(201).json(tripView(trip, req.user));
  })
);

router.post(
  '/:id/cargo/:cargoId/:action(pickup|deliver)',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    const item = trip.cargo.id(req.params.cargoId);
    if (!item) throw new HttpError(404, 'Cargo item not found');
    if (req.params.action === 'pickup') await pickupCargo(trip, item);
    else await deliverCargo(trip, item);
    res.json(tripView(trip, req.user));
  })
);

/* ---------- Opportunities: open shipments that fit this journey ---------- */
router.get(
  '/:id/opportunities',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const trip = await ownTrip(req);
    if (!['planned', 'in_transit'].includes(trip.status)) return res.json([]);
    const open = await Shipment.find({ status: 'open' }).populate('customer', 'name');
    const plain = trip.toObject();
    const ranked = rankShipmentsForTrip(plain, open.map((s) => s.toObject()));
    res.json(
      ranked.map(({ shipment, match }) => ({
        shipment: shipmentView(shipment, req.user),
        match
      }))
    );
  })
);

export default router;
