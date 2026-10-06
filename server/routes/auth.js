const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { createSession, destroySession } = require('../middleware/auth');
const { ValidationError } = require('../middleware/errors');

const router = express.Router();

// Register
router.post('/register', (req, res, next) => {
  const { name, email, password, phone, role } = req.body;

  if (!name || !email || !password) {
    throw new ValidationError('Name, email, and password are required');
  }

  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'admin' || role === 'provider' ? role : 'customer';

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email.toLowerCase(), hash, phone || null, userRole);

  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = createSession(user.id);

  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.status(201).json({ user });
});

// Login
router.post('/login', (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  if (!user) {
    throw new ValidationError('Invalid email or password');
  }

  const valid = bcrypt.compareSync(password, user.password_hash);

  if (!valid) {
    throw new ValidationError('Invalid email or password');
  }

  const token = createSession(user.id);

  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// Logout
router.post('/logout', (req, res) => {
  destroySession(req.cookies.session_token);
  res.clearCookie('session_token');
  res.json({ success: true });
});

// Get current user
router.get('/me', (req, res, next) => {
  const token = req.cookies.session_token;
  const session = db.prepare(`
    SELECT s.*, u.id as user_id, u.name, u.email, u.role, u.phone
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) {
    return res.status(401).json({ user: null });
  }

  res.json({
    user: {
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: session.role,
      phone: session.phone
    }
  });
});

module.exports = router;