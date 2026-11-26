// VISIBILITY LEVELS
//  - public            : vehicle type, available capacity, general cargo categories, route, location, ETA
//  - confirmed customer: public + full details of THEIR OWN cargo/booking (pickup, delivery, price)
//  - driver (owner)/admin: full cargo manifest incl. weights, dimensions, handling notes and customers
import { buildRoute, truckPosition, truckProgress, lastStopIndex, AVG_SPEED_KMPH } from './route.js';
import { capacityNow, capacityTimeline } from './capacity.js';
import { roadKm, round } from '../utils/geo.js';

const idStr = (x) => (x && x._id ? String(x._id) : x ? String(x) : '');

export function tripView(trip, viewer = null) {
  const t = trip.toObject ? trip.toObject() : trip;
  const vehicle = t.vehicle || {};
  const driver = t.driver || {};
  const route = buildRoute(t.stops);
  const isOwner = viewer && idStr(driver) === String(viewer._id);
  const isAdmin = viewer && viewer.role === 'admin';
  const full = isOwner || isAdmin;

  const progressKm = t.status === 'in_transit' ? truckProgress(route, t) : route.cum[0];
  const pos = truckPosition(route, t);
  const nextIdx = Math.min(route.stops.length - 1, lastStopIndex(route, progressKm) + 1);
  const next = route.stops[nextIdx];
  const toNextKm = round(roadKm(pos, next), 1);
  const remainingKm = round(Math.max(0, route.totalKm - progressKm), 1);

  const cap = capacityNow(t, vehicle);
  const live = t.cargo.filter((c) => c.status !== 'delivered');

  const view = {
    id: idStr(t),
    status: t.status,
    isReturn: t.isReturn,
    departureTime: t.departureTime,
    driver: { id: idStr(driver), name: driver.name, verified: !!driver.verified, phone: full ? driver.phone : undefined },
    vehicle: {
      id: idStr(vehicle),
      type: vehicle.type,
      label: vehicle.label,
      regNo: full ? vehicle.regNo : String(vehicle.regNo || '').replace(/.(?=.{4})/g, '•'),
      capacityKg: vehicle.capacityKg,
      capacityCbm: vehicle.capacityCbm
    },
    stops: t.stops,
    totalKm: round(route.totalKm),
    stopKm: route.cum.map((k) => round(k)),
    currentLocation: pos,
    currentStopIndex: lastStopIndex(route, progressKm),
    nextStop: next.name,
    distanceToNextStopKm: toNextKm,
    etaNextStopMinutes: Math.round((toNextKm / AVG_SPEED_KMPH) * 60),
    remainingKm,
    capacity: cap,
    cargoCategories: [...new Set(live.map((c) => c.category))], // public: general category only
    createdAt: t.createdAt
  };

  if (full) {
    view.manifest = t.cargo.map((c) => ({ ...c, id: idStr(c), booking: idStr(c.booking), customer: idStr(c.customer) }));
    view.timeline = capacityTimeline(t, vehicle, route);
    view.baseEarnings = t.baseEarnings;
    view.additionalEarnings = t.additionalEarnings;
    view.costPerKm = t.costPerKm;
    view.tollPerKm = t.tollPerKm;
  } else if (viewer) {
    // a confirmed customer sees full detail for their own cargo only
    view.myCargo = t.cargo
      .filter((c) => idStr(c.customer) === String(viewer._id))
      .map((c) => ({ ...c, id: idStr(c), booking: idStr(c.booking), customer: idStr(c.customer) }));
  }
  return view;
}

export function shipmentView(shipment, viewer = null) {
  const s = shipment.toObject ? shipment.toObject() : shipment;
  const customer = s.customer || {};
  const mine = viewer && (viewer.role === 'admin' || idStr(customer) === String(viewer._id));
  return {
    id: idStr(s),
    pickup: s.pickup,
    drop: s.drop,
    weightKg: s.weightKg,
    volumeCbm: s.volumeCbm,
    category: s.category,
    special: s.special,
    offeredPrice: s.offeredPrice,
    needBy: s.needBy,
    status: s.status,
    createdAt: s.createdAt,
    description: mine ? s.description : undefined,
    customerName: customer.name
  };
}
