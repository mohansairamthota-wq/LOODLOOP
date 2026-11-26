import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { signToken, requireAuth, wrap, HttpError } from '../middleware/auth.js';

const router = Router();

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone,
  company: u.company,
  role: u.role,
  verified: u.verified
});

router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password, phone, company, role } = req.body;
    if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (!['customer', 'driver'].includes(role)) throw new HttpError(400, 'Role must be customer or driver');
    if (await User.findOne({ email: email.toLowerCase() })) throw new HttpError(409, 'Email already registered');

    const user = await User.create({
      name,
      email,
      phone,
      company,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      verified: role === 'customer' // drivers wait for admin verification
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    if (user.suspended) throw new HttpError(403, 'This account has been suspended');
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', requireAuth(), (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
