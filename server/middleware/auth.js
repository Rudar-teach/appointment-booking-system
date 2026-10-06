const db = require('../db');
const { randomBytes } = require('crypto');

const SESSION_TTL_HOURS = 24 * 7; // 7 days

function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);

  return token;
}

function getSession(token) {
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.*, u.id as user_id, u.name, u.email, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  return session || null;
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function requireAuth(req, res, next) {
  const token = req.cookies.session_token;
  const session = getSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = {
    id: session.user_id,
    name: session.name,
    email: session.email,
    role: session.role
  };

  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { createSession, getSession, destroySession, requireAuth, requireAdmin };