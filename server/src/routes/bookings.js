import { Router } from 'express';
import { Booking, Shipment, Trip } from '../models/index.js';
import { requireAuth, wrap, HttpError } from '../middleware/auth.js';
import { evaluateMatch } from '../services/matching.js';
import { estimateProfit } from '../services/profit.js';
import { buildRoute, locate } from '../services/route.js';
import { pickupCargo, deliverCargo } from '../services/cargoFlow.js';
import { tripView, shipmentView } from '../services/views.js';

const router = Router();
const idStr = (x) => String(x && x._id ? x._id : x);

const loadTrip = (id) => Trip.findById(id).populate('vehicle').populate('driver', 'name phone verified');

function bookingView(b, viewer, trip) {
  const o = b.toObject();
  const shipment = shipmentView(b.shipment, viewer);
  // the driver only sees private cargo details once the booking is confirmed
  if (viewer.role === 'driver' && ['accepted', 'picked_up', 'delivered'].includes(o.status)) {
    shipment.description = b.shipment.description;
  }
  return {
    id: idStr(o),
    status: o.status,
    initiatedBy: o.initiatedBy,
    price: o.price,
    commission: o.commission,
    driverPayout: o.driverPayout,
    matchScore: o.matchScore,
    rating: o.rating,
    review: o.review,
    createdAt: o.createdAt,
    customer: viewer.role === 'customer' ? undefined : { id: idStr(o.customer), name: b.customer && b.customer.name, phone: ['accepted', 'picked_up', 'delivered'].includes(o.status) ? b.customer && b.customer.phone : undefined },
    driver: { id: idStr(o.driver), name: b.driver && b.driver.name, phone: ['accepted', 'picked_up', 'delivered'].includes(o.status) ? b.driver && b.driver.phone : undefined },
    shipment,
    trip: trip ? tripView(trip, viewer) : undefined
  };
}

/* ---------- Customer requests space on a truck ---------- */
router.post(
  '/',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const { shipmentId, tripId } = req.body;
    const shipment = await Shipment.findOne({ _id: shipmentId, customer: req.user._id });
    if (!shipment) throw new HttpError(404, 'Shipment not found');
    if (shipment.status !== 'open') throw new HttpError(400, 'This shipment already has a booking');

    const trip = await loadTrip(tripId);
    if (!trip || !['planned', 'in_transit'].includes(trip.status)) throw new HttpError(400, 'This trip is no longer available');
    if (!trip.driver.verified) throw new HttpError(400, 'This driver is not verified yet');

    const match = evaluateMatch(trip.toObject(), shipment.toObject());
    if (!match.feasible) throw new HttpError(400, `This truck cannot take the shipment: ${match.reasons.join('; ')}`);

    const booking = await Booking.create({
      shipment: shipment._id,
      trip: trip._id,
      customer: req.user._id,
      driver: trip.driver._id,
      price: shipment.offeredPrice,
      matchScore: match.score
    });
    shipment.status = 'requested';
    await shipment.save();
    res.status(201).json({ id: String(booking._id), status: booking.status, match });
  })
);

/* ---------- My bookings (customer: placed by me, driver: for my trips) ---------- */
router.get(
  '/mine',
  requireAuth('customer', 'driver'),
  wrap(async (req, res) => {
    const filter = req.user.role === 'customer' ? { customer: req.user._id } : { driver: req.user._id };
    const list = await Booking.find(filter)
      .sort('-createdAt')
      .populate('shipment')
      .populate('customer', 'name phone')
      .populate('driver', 'name phone');
    const out = [];
    for (const b of list) {
      const trip = await loadTrip(b.trip);
      out.push(bookingView(b, req.user, trip));
    }
    res.json(out);
  })
);

async function ownBookingAsDriver(req) {
  const booking = await Booking.findById(req.params.id).populate('shipment');
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (idStr(booking.driver) !== String(req.user._id)) throw new HttpError(403, 'This booking is not on your trip');
  return booking;
}

/* ---------- Confirm a booking: cargo is added to the trip manifest ---------- */
// Used when the driver accepts a customer's request, or the customer confirms a driver's offer.
async function confirmBooking(booking) {
  const trip = await loadTrip(booking.trip);
  const shipment = booking.shipment;

  // Capacity may have changed since the request was made - check again.
  const match = evaluateMatch(trip.toObject(), shipment.toObject());
  if (!match.feasible) throw new HttpError(400, `No longer possible: ${match.reasons.join('; ')}`);

  const route = buildRoute(trip.stops);
  const profit = estimateProfit({ price: booking.price });
  trip.cargo.push({
    label: `${shipment.category.replace('_', ' ')} for ${shipment.drop.name}`,
    category: shipment.category,
    weightKg: shipment.weightKg,
    volumeCbm: shipment.volumeCbm,
    fromName: shipment.pickup.name,
    toName: shipment.drop.name,
    fromKm: locate(route, shipment.pickup).progressKm,
    toKm: locate(route, shipment.drop).progressKm,
    special: shipment.special,
    status: 'waiting',
    booking: booking._id,
    customer: booking.customer,
    notes: shipment.description
  });
  await trip.save();

  booking.status = 'accepted';
  booking.commission = profit.commission;
  booking.driverPayout = booking.price - profit.commission;
  await booking.save();
  shipment.status = 'booked';
  await shipment.save();
}

router.post(
  '/:id/accept',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const booking = await ownBookingAsDriver(req);
    if (booking.status !== 'requested') throw new HttpError(400, 'This request was already handled');
    await confirmBooking(booking);
    res.json({ ok: true, status: booking.status });
  })
);

/* ---------- Driver offers to carry an open shipment (from the opportunities list) ---------- */
router.post(
  '/offer',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const { shipmentId, tripId } = req.body;
    const trip = await loadTrip(tripId);
    if (!trip || String(trip.driver._id) !== String(req.user._id)) throw new HttpError(403, 'This is not your trip');
    if (!['planned', 'in_transit'].includes(trip.status)) throw new HttpError(400, 'This trip is not active');
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment || shipment.status !== 'open') throw new HttpError(400, 'This shipment is no longer open');
    const match = evaluateMatch(trip.toObject(), shipment.toObject());
    if (!match.feasible) throw new HttpError(400, `This shipment does not fit your trip: ${match.reasons.join('; ')}`);
    const booking = await Booking.create({
      shipment: shipment._id,
      trip: trip._id,
      customer: shipment.customer,
      driver: req.user._id,
      price: shipment.offeredPrice,
      matchScore: match.score,
      status: 'offered',
      initiatedBy: 'driver'
    });
    shipment.status = 'requested';
    await shipment.save();
    res.status(201).json({ id: String(booking._id), status: booking.status });
  })
);

/* ---------- Customer confirms a driver's offer ---------- */
router.post(
  '/:id/confirm',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id }).populate('shipment');
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.status !== 'offered') throw new HttpError(400, 'There is no pending offer to confirm');
    await confirmBooking(booking);
    res.json({ ok: true, status: booking.status });
  })
);

router.post(
  '/:id/reject',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const booking = await ownBookingAsDriver(req);
    if (!['requested', 'offered'].includes(booking.status)) throw new HttpError(400, 'This request was already handled');
    booking.status = booking.status === 'offered' ? 'cancelled' : 'rejected';
    await booking.save();
    await Shipment.findByIdAndUpdate(booking.shipment._id, { status: 'open' });
    res.json({ ok: true, status: booking.status });
  })
);

/* ---------- Driver: pickup / delivery (updates capacity) ---------- */
async function cargoAction(req, res, action) {
  const booking = await ownBookingAsDriver(req);
  const trip = await loadTrip(booking.trip);
  const item = trip.cargo.find((c) => c.booking && idStr(c.booking) === idStr(booking._id));
  if (!item) throw new HttpError(400, 'This booking has not been accepted yet');
  if (action === 'pickup') await pickupCargo(trip, item);
  else await deliverCargo(trip, item);
  res.json({ ok: true, trip: tripView(trip, req.user) });
}
router.post('/:id/pickup', requireAuth('driver'), wrap((req, res) => cargoAction(req, res, 'pickup')));
router.post('/:id/deliver', requireAuth('driver'), wrap((req, res) => cargoAction(req, res, 'deliver')));

/* ---------- Customer: cancel / rate ---------- */
router.post(
  '/:id/cancel',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (!['requested', 'offered', 'accepted'].includes(booking.status)) throw new HttpError(400, 'It is too late to cancel this booking');
    if (booking.status === 'accepted') {
      const trip = await Trip.findById(booking.trip);
      const item = trip.cargo.find((c) => c.booking && idStr(c.booking) === idStr(booking._id));
      if (item) {
        trip.cargo.pull(item._id);
        await trip.save();
      }
    }
    booking.status = 'cancelled';
    await booking.save();
    await Shipment.findByIdAndUpdate(booking.shipment, { status: 'open' });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/rate',
  requireAuth('customer'),
  wrap(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.status !== 'delivered') throw new HttpError(400, 'You can rate a booking after delivery');
    const rating = Number(req.body.rating);
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating must be 1 to 5');
    booking.rating = rating;
    booking.review = req.body.review;
    await booking.save();
    res.json({ ok: true });
  })
);

export default router;
