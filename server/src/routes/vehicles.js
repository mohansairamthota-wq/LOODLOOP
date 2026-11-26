import { Router } from 'express';
import { Vehicle, VEHICLE_TYPES } from '../models/index.js';
import { requireAuth, wrap, HttpError } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  requireAuth('driver'),
  wrap(async (req, res) => {
    res.json(await Vehicle.find({ owner: req.user._id }).sort('-createdAt'));
  })
);

router.post(
  '/',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const { regNo, label, type, capacityKg, capacityCbm } = req.body;
    if (!regNo || !capacityKg) throw new HttpError(400, 'Registration number and capacity (kg) are required');
    if (type && !VEHICLE_TYPES.includes(type)) throw new HttpError(400, 'Unknown vehicle type');
    const v = await Vehicle.create({
      owner: req.user._id,
      regNo,
      label,
      type,
      capacityKg: Number(capacityKg),
      capacityCbm: Number(capacityCbm) || 0
    });
    res.status(201).json(v);
  })
);

router.delete(
  '/:id',
  requireAuth('driver'),
  wrap(async (req, res) => {
    const v = await Vehicle.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!v) throw new HttpError(404, 'Vehicle not found');
    res.json({ ok: true });
  })
);

export default router;
