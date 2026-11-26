import { Router } from 'express';
import { User, Trip, Booking, Vehicle, Shipment } from '../models/index.js';
import { requireAuth, wrap, HttpError } from '../middleware/auth.js';
import { tripView } from '../services/views.js';

const router = Router();
router.use(requireAuth('admin'));

router.get(
  '/stats',
  wrap(async (_req, res) => {
    const [users, drivers, pendingDrivers, trips, activeTrips, bookings, deliveredBookings, vehicles, openShipments] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'driver' }),
      User.countDocuments({ role: 'driver', verified: false }),
      Trip.countDocuments(),
      Trip.countDocuments({ status: { $in: ['planned', 'in_transit'] } }),
      Booking.countDocuments(),
      Booking.find({ status: 'delivered' }),
      Vehicle.countDocuments(),
      Shipment.countDocuments({ status: 'open' })
    ]);
    res.json({
      customers: users,
      drivers,
      pendingDrivers,
      vehicles,
      trips,
      activeTrips,
      openShipments,
      bookings,
      deliveredBookings: deliveredBookings.length,
      grossBookingValue: deliveredBookings.reduce((s, b) => s + b.price, 0),
      platformRevenue: deliveredBookings.reduce((s, b) => s + b.commission, 0)
    });
  })
);

router.get(
  '/users',
  wrap(async (_req, res) => {
    const users = await User.find().sort('-createdAt').select('-passwordHash');
    res.json(users);
  })
);

router.post(
  '/users/:id/verify',
  wrap(async (req, res) => {
    const u = await User.findById(req.params.id);
    if (!u || u.role !== 'driver') throw new HttpError(404, 'Driver not found');
    u.verified = req.body.verified !== false;
    await u.save();
    res.json({ id: String(u._id), verified: u.verified });
  })
);

router.post(
  '/users/:id/suspend',
  wrap(async (req, res) => {
    const u = await User.findById(req.params.id);
    if (!u) throw new HttpError(404, 'User not found');
    if (u.role === 'admin') throw new HttpError(400, 'Admin accounts cannot be suspended');
    u.suspended = req.body.suspended !== false;
    await u.save();
    res.json({ id: String(u._id), suspended: u.suspended });
  })
);

router.get(
  '/trips',
  wrap(async (req, res) => {
    const trips = await Trip.find().sort('-createdAt').limit(100).populate('vehicle').populate('driver', 'name phone verified');
    res.json(trips.map((t) => tripView(t, req.user)));
  })
);

router.get(
  '/bookings',
  wrap(async (_req, res) => {
    const list = await Booking.find()
      .sort('-createdAt')
      .limit(100)
      .populate('customer', 'name')
      .populate('driver', 'name')
      .populate('shipment', 'pickup drop weightKg category status');
    res.json(list);
  })
);

export default router;
