import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'loadloop-dev-secret-change-me';

export const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

async function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(id);
    if (!user || user.suspended) return null;
    return user;
  } catch {
    return null;
  }
}

// Attach req.user if a valid token is present (public routes use this for visibility levels).
export async function optionalAuth(req, _res, next) {
  req.user = await readUser(req);
  next();
}

// Require login, optionally restricted to certain roles.
export const requireAuth =
  (...roles) =>
  async (req, res, next) => {
    const user = await readUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in' });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: `This action is for ${roles.join('/')} accounts` });
    }
    req.user = user;
    next();
  };

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
