import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const placeSchema = new Schema({ name: String, lat: Number, lng: Number }, { _id: false });

/* ---------- Users ---------- */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    company: String,
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'driver', 'admin'], default: 'customer' },
    verified: { type: Boolean, default: false }, // drivers must be verified by admin to be listed publicly
    suspended: { type: Boolean, default: false }
  },
  { timestamps: true }
);

/* ---------- Vehicles ---------- */
export const VEHICLE_TYPES = ['open', 'container', 'closed', 'refrigerated', 'flatbed', 'tanker'];

const vehicleSchema = new Schema(
  {
    owner: { type: ObjectId, ref: 'User', required: true },
    regNo: { type: String, required: true, uppercase: true, trim: true },
    label: String, // e.g. "14-ft container"
    type: { type: String, enum: VEHICLE_TYPES, default: 'container' },
    capacityKg: { type: Number, required: true, min: 1 },
    capacityCbm: { type: Number, default: 0 } // 0 = volume not tracked
  },
  { timestamps: true }
);

/* ---------- Trips (a driver's journey, with live cargo) ---------- */
const cargoSchema = new Schema({
  label: { type: String, required: true },
  category: { type: String, default: 'general' },
  weightKg: { type: Number, required: true, min: 0 },
  volumeCbm: { type: Number, default: 0 },
  fromName: String,
  toName: String,
  fromKm: { type: Number, default: 0 }, // position along the planned route
  toKm: { type: Number, default: 0 },
  special: [String], // handling requirements, e.g. fragile, keep-dry
  status: { type: String, enum: ['waiting', 'loaded', 'delivered'], default: 'waiting' },
  booking: { type: ObjectId, ref: 'Booking' },
  customer: { type: ObjectId, ref: 'User' },
  notes: String // private details: only the driver/admin and the owning customer see these
});

const tripSchema = new Schema(
  {
    driver: { type: ObjectId, ref: 'User', required: true },
    vehicle: { type: ObjectId, ref: 'Vehicle', required: true },
    stops: { type: [placeSchema], validate: (v) => v.length >= 2 },
    status: { type: String, enum: ['planned', 'in_transit', 'completed', 'cancelled'], default: 'planned' },
    currentStopIndex: { type: Number, default: 0 },
    currentLocation: { lat: Number, lng: Number, updatedAt: Date },
    departureTime: Date,
    baseEarnings: { type: Number, default: 0 }, // earnings from the original cargo
    additionalEarnings: { type: Number, default: 0 }, // earned through LoadLoop bookings
    costPerKm: { type: Number, default: 14 }, // fuel + wear per km (used for deviation cost)
    tollPerKm: { type: Number, default: 2.5 },
    isReturn: { type: Boolean, default: false },
    returnOf: { type: ObjectId, ref: 'Trip' },
    cargo: [cargoSchema]
  },
  { timestamps: true }
);

/* ---------- Shipments (a customer's request) ---------- */
export const CATEGORIES = [
  'general',
  'electronics',
  'fmcg',
  'industrial',
  'furniture',
  'construction',
  'agricultural',
  'food_perishable',
  'pharma',
  'textiles',
  'auto_parts',
  'hazardous'
];

const shipmentSchema = new Schema(
  {
    customer: { type: ObjectId, ref: 'User', required: true },
    pickup: { type: placeSchema, required: true },
    drop: { type: placeSchema, required: true },
    weightKg: { type: Number, required: true, min: 1 },
    volumeCbm: { type: Number, default: 0 },
    category: { type: String, enum: CATEGORIES, default: 'general' },
    description: String, // private
    special: [String],
    offeredPrice: { type: Number, required: true, min: 0 },
    needBy: Date,
    status: { type: String, enum: ['open', 'requested', 'booked', 'in_transit', 'delivered', 'cancelled'], default: 'open' }
  },
  { timestamps: true }
);

/* ---------- Bookings ---------- */
const bookingSchema = new Schema(
  {
    shipment: { type: ObjectId, ref: 'Shipment', required: true },
    trip: { type: ObjectId, ref: 'Trip', required: true },
    customer: { type: ObjectId, ref: 'User', required: true },
    driver: { type: ObjectId, ref: 'User', required: true },
    price: { type: Number, required: true },
    commission: { type: Number, default: 0 },
    driverPayout: { type: Number, default: 0 },
    matchScore: Number,
    status: {
      type: String,
      enum: ['requested', 'offered', 'accepted', 'rejected', 'picked_up', 'delivered', 'cancelled'],
      default: 'requested' // requested = customer asked the driver; offered = driver offered to the customer
    },
    initiatedBy: { type: String, enum: ['customer', 'driver'], default: 'customer' },
    rating: { type: Number, min: 1, max: 5 },
    review: String
  },
  { timestamps: true }
);

export const User = model('User', userSchema);
export const Vehicle = model('Vehicle', vehicleSchema);
export const Trip = model('Trip', tripSchema);
export const Shipment = model('Shipment', shipmentSchema);
export const Booking = model('Booking', bookingSchema);
