import { Router } from 'express';
import { Shipment, Trip, CATEGORIES } from '../models/index.js';
import { requireAuth, optionalAuth, wrap, HttpError } from '../middleware/auth.js';
import { resolvePlace, CITIES } from '../data/cities.js';
import { roadKm, round } from '../utils/geo.js';
import { suggestPrice, COMMISSION_PCT } from '../services/profit.js';
import { rankTripsForShipment } from '../services/matching.js';
import { tripView, shipmentView } from '../services/views.js';

const router = Router();

export async function activeTrips() {
  const trips = await Trip.find({ status: { $in: ['planned', 'in_transit'] } })
    .populate('vehicle')
    .populate('driver', 'name phone verified suspended');
  // only verified, non-suspended drivers are listed publicly
  return trips.filter((t) => t.driver && t.driver.verified && !t.driver.suspended && t.vehicle);
}

export function parseShipmentInput(body) {
  const pickup = resolvePlace(body.pickup);
  const drop = resolvePlace(body.drop);
  if (!pickup || !drop) throw new HttpError(400, 'Choose a valid pickup and drop city');
  if (pickup.name === drop.name) throw new HttpError(400, 'Pickup and drop must be different');
  const weightKg = Number(body.weightKg);
  if (!(weightKg > 0)) throw new HttpError(400, 'Weight (kg) must be greater than zero');
  const category = body.category || 'general';
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Unknown cargo category');
  const km = roadKm(pickup, drop);
  const offeredPrice = Number(body.offeredPrice) > 0 ? Number(body.offeredPrice) : suggestPrice(weightKg, km);
  return {
    pickup,
    drop,
    weightKg,
    volumeCbm: Number(body.volumeCbm) || 0,
    category,
    special: body.special || [],
    description: body.description,
    offeredPrice,
    needBy: body.needBy ? new Date(body.needBy) : undefined
  };
}

/* ---------- Reference data ---------- */
router.get('/meta/cities', (_req, res) => res.json(CITIES));
router.get('/meta/categories', (_req, res) => res.json(CATEGORIES));
router.get('/meta/commission', (_req, res) => res.json({ commissionPct: COMMISSION_PCT }));

/* ---------- Price quote ---------- */
router.get('/quote', (req, res) => {
  const pickup = resolvePlace(req.query.pickup);
  const drop = resolvePlace(req.query.drop);
  const weight = Number(req.query.weight);
  if (!pickup || !drop || !(weight > 0)) return res.status(400).json({ error: 'pickup, drop and weight are required' });
  const km = roadKm(pickup, drop);
  res.json({ distanceKm: round(km), suggestedPrice: suggestPrice(weight, km) });
});

/* ---------- Public truck search (no login needed; public visibility level) ---------- */
router.get(
  '/search/trucks',
  optionalAuth,
  wrap(async (req, res) => {
    const input = parseShipmentInput({ ...req.query, pickup: req.query.pickup, drop: req.query.drop });
    const trips = await activeTrips();
    const ranked = rankTripsForShipment(
      trips.map((t) => t.toObject()),
      input
    );
    const byId = new Map(trips.map((t) => [String(t._id), t]));
    res.json({
      shipment: { ...input, distanceKm: round(roadKm(input.pickup, input.drop)) },
      results: ranked.map(({ trip, match }) => ({ trip: tripView(byId.get(String(trip._id)), req.user), match }))
    });
  })
);

/* ---------- Customer's shipments ---------- */
router.post(
  '/',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const s = await Shipment.create({ ...parseShipmentInput(req.body), customer: req.user._id });
    res.status(201).json(shipmentView(s, req.user));
  })
);

router.get(
  '/mine',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const list = await Shipment.find({ customer: req.user._id }).sort('-createdAt');
    res.json(list.map((s) => shipmentView(s, req.user)));
  })
);

router.get(
  '/:id/matches',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const s = await Shipment.findOne({ _id: req.params.id, customer: req.user._id });
    if (!s) throw new HttpError(404, 'Shipment not found');
    const trips = await activeTrips();
    const ranked = rankTripsForShipment(
      trips.map((t) => t.toObject()),
      s.toObject()
    );
    const byId = new Map(trips.map((t) => [String(t._id), t]));
    res.json({
      shipment: shipmentView(s, req.user),
      results: ranked.map(({ trip, match }) => ({ trip: tripView(byId.get(String(trip._id)), req.user), match }))
    });
  })
);

router.delete(
  '/:id',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const s = await Shipment.findOne({ _id: req.params.id, customer: req.user._id });
    if (!s) throw new HttpError(404, 'Shipment not found');
    if (s.status !== 'open') throw new HttpError(400, 'Only open shipments can be cancelled - cancel the booking first');
    s.status = 'cancelled';
    await s.save();
    res.json({ ok: true });
  })
);

export default router;
