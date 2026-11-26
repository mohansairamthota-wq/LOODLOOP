// Demo data: one admin, drivers, customers, the Eluru -> Hyderabad truck from the project brief, and open shipments.
// Run with `npm run seed` (needs MONGO_URI) - or it runs automatically with the in-memory database.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { User, Vehicle, Trip, Shipment, Booking } from './models/index.js';
import { findCity } from './data/cities.js';
import { buildRoute, locate } from './services/route.js';

export const DEMO_PASSWORD = 'password123';

const city = (n) => findCity(n);

function cargoItem(route, { label, category, weightKg, from, to, status }) {
  return {
    label,
    category,
    weightKg,
    fromName: from,
    toName: to,
    fromKm: locate(route, city(from)).progressKm,
    toKm: locate(route, city(to)).progressKm,
    status
  };
}

export async function seedDatabase() {
  await Promise.all([User, Vehicle, Trip, Shipment, Booking].map((m) => m.deleteMany({})));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [admin, d1, d2, d3, c1, c2] = await User.create([
    { name: 'LoadLoop Admin', email: 'admin@loadloop.in', phone: '9000000000', role: 'admin', verified: true, passwordHash },
    { name: 'Ravi Kumar', email: 'ravi@loadloop.in', phone: '9000000001', role: 'driver', verified: true, passwordHash },
    { name: 'Suresh Reddy', email: 'suresh@loadloop.in', phone: '9000000002', role: 'driver', verified: true, passwordHash },
    { name: 'Mahesh Naidu (unverified)', email: 'mahesh@loadloop.in', phone: '9000000003', role: 'driver', verified: false, passwordHash },
    { name: 'Anitha Traders', email: 'anitha@loadloop.in', phone: '9000000010', company: 'Anitha Traders', role: 'customer', verified: true, passwordHash },
    { name: 'Kiran Electronics', email: 'kiran@loadloop.in', phone: '9000000011', company: 'Kiran Electronics', role: 'customer', verified: true, passwordHash }
  ]);

  const [v1, v2, v3] = await Vehicle.create([
    { owner: d1._id, regNo: 'AP39TX1024', label: '14-ft container', type: 'container', capacityKg: 5000, capacityCbm: 30 },
    { owner: d2._id, regNo: 'TS09UA7788', label: '10-ton closed truck', type: 'closed', capacityKg: 10000, capacityCbm: 45 },
    { owner: d3._id, regNo: 'AP37BD5521', label: 'Open body truck', type: 'open', capacityKg: 7000 }
  ]);

  // Trip 1 - the example from the brief: Eluru -> Vijayawada -> Guntur -> Hyderabad, 5,000 kg truck, 3,000 kg on board
  const stops1 = ['Eluru', 'Vijayawada', 'Guntur', 'Hyderabad'].map(city);
  const r1 = buildRoute(stops1);
  const trip1 = await Trip.create({
    driver: d1._id,
    vehicle: v1._id,
    stops: stops1,
    status: 'planned',
    departureTime: new Date(Date.now() + 3 * 3600 * 1000),
    baseEarnings: 18500,
    cargo: [
      cargoItem(r1, { label: 'Electronics', category: 'electronics', weightKg: 2000, from: 'Eluru', to: 'Hyderabad', status: 'loaded' }),
      cargoItem(r1, { label: 'General goods', category: 'general', weightKg: 1000, from: 'Eluru', to: 'Guntur', status: 'loaded' })
    ]
  });
  // its empty return journey - the original "return booking" idea
  await Trip.create({
    driver: d1._id,
    vehicle: v1._id,
    stops: [...stops1].reverse(),
    isReturn: true,
    returnOf: trip1._id,
    departureTime: new Date(Date.now() + 30 * 3600 * 1000),
    cargo: []
  });

  // Trip 2 - a 10-ton closed truck already on the road, Hyderabad -> Vijayawada -> Eluru -> Rajahmundry
  const stops2 = ['Hyderabad', 'Suryapet', 'Vijayawada', 'Eluru', 'Rajahmundry'].map(city);
  const r2 = buildRoute(stops2);
  const trip2 = await Trip.create({
    driver: d2._id,
    vehicle: v2._id,
    stops: stops2,
    status: 'in_transit',
    currentStopIndex: 1,
    currentLocation: { lat: city('Suryapet').lat + 0.05, lng: city('Suryapet').lng + 0.2, updatedAt: new Date() },
    baseEarnings: 32000,
    cargo: [
      cargoItem(r2, { label: 'FMCG cartons', category: 'fmcg', weightKg: 6000, from: 'Hyderabad', to: 'Rajahmundry', status: 'loaded' }),
      cargoItem(r2, { label: 'Furniture', category: 'furniture', weightKg: 1500, from: 'Hyderabad', to: 'Vijayawada', status: 'loaded' })
    ]
  });

  // Unverified driver's trip - will not appear in public search until the admin verifies the driver
  const stops3 = ['Guntur', 'Vijayawada', 'Eluru', 'Rajahmundry', 'Visakhapatnam'].map(city);
  await Trip.create({ driver: d3._id, vehicle: v3._id, stops: stops3, status: 'planned', cargo: [] });

  const mk = (customer, a, b, weightKg, category, offeredPrice, description) => ({
    customer: customer._id,
    pickup: city(a),
    drop: city(b),
    weightKg,
    category,
    offeredPrice,
    description
  });
  await Shipment.create([
    mk(c1, 'Eluru', 'Vijayawada', 500, 'general', 900, 'Cartons of stationery'),
    mk(c1, 'Vijayawada', 'Guntur', 700, 'industrial', 1200, 'Machine spare parts'),
    mk(c2, 'Guntur', 'Hyderabad', 500, 'electronics', 1500, '40 boxed LED TVs - handle with care'),
    mk(c2, 'Eluru', 'Rajahmundry', 500, 'general', 900, 'Household goods'),
    mk(c1, 'Hyderabad', 'Eluru', 3000, 'construction', 5200, 'Tiles - return load'),
    mk(c2, 'Vijayawada', 'Hyderabad', 500, 'electronics', 2100, 'Laptops and accessories')
  ]);

  console.log(`Seeded demo data. All demo accounts use the password "${DEMO_PASSWORD}":
  admin@loadloop.in (admin)  ravi@loadloop.in, suresh@loadloop.in (drivers)  anitha@loadloop.in, kiran@loadloop.in (customers)`);
  return { trip1: String(trip1._id), trip2: String(trip2._id), admin: String(admin._id) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.MONGO_URI) {
    console.error('Set MONGO_URI in server/.env before running the seed script.');
    process.exit(1);
  }
  mongoose
    .connect(process.env.MONGO_URI)
    .then(seedDatabase)
    .then(() => mongoose.disconnect());
}
