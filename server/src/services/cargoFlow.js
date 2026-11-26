// Moves cargo through its life: waiting -> loaded (picked up) -> delivered, and keeps capacity, bookings,
// shipments and earnings in sync. Capacity is never stored - it is always derived from the cargo list,
// so it can't drift out of sync.
import { Booking, Shipment } from '../models/index.js';
import { HttpError } from '../middleware/auth.js';
import { capacityNow } from './capacity.js';

export async function pickupCargo(trip, cargoItem) {
  if (trip.status !== 'in_transit') throw new HttpError(400, 'Start the trip before picking up cargo');
  if (cargoItem.status !== 'waiting') throw new HttpError(400, 'This cargo is not waiting for pickup');

  const cap = capacityNow(trip.toObject(), trip.vehicle);
  if (cargoItem.weightKg > cap.availableKg) {
    throw new HttpError(400, `Not enough space on board: ${cap.availableKg} kg free, cargo is ${cargoItem.weightKg} kg`);
  }
  cargoItem.status = 'loaded';

  if (cargoItem.booking) {
    await Booking.findByIdAndUpdate(cargoItem.booking, { status: 'picked_up' });
    await Shipment.findOneAndUpdate({ _id: (await Booking.findById(cargoItem.booking)).shipment }, { status: 'in_transit' });
  }
  await trip.save();
}

export async function deliverCargo(trip, cargoItem) {
  if (cargoItem.status !== 'loaded') throw new HttpError(400, 'This cargo is not on board');
  cargoItem.status = 'delivered';

  if (cargoItem.booking) {
    const booking = await Booking.findById(cargoItem.booking);
    if (booking) {
      booking.status = 'delivered';
      await booking.save();
      await Shipment.findByIdAndUpdate(booking.shipment, { status: 'delivered' });
      trip.additionalEarnings = (trip.additionalEarnings || 0) + booking.driverPayout;
    }
  }
  await trip.save();
}
