import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import vehicleRoutes from './routes/vehicles.js';
import tripRoutes from './routes/trips.js';
import shipmentRoutes from './routes/shipments.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'LoadLoop' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/shipments', shipmentRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app when it exists (single-server deployment)
  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server' });
  });
  return app;
}

export async function connectDb() {
  const uri = process.env.MONGO_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
    return;
  }
  // No MONGO_URI: start a throwaway in-memory MongoDB so the app runs with zero setup (data resets on restart).
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  console.log('Using in-memory MongoDB (set MONGO_URI in server/.env to keep data)');
  if (process.env.SEED !== 'false') {
    const { seedDatabase } = await import('./seed.js');
    await seedDatabase();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 5000;
  connectDb()
    .then(() => createApp().listen(port, '0.0.0.0', () => console.log(`LoadLoop API running on port ${port}`)))
    .catch((e) => {
      console.error('Failed to start:', e.message);
      process.exit(1);
    });
}
