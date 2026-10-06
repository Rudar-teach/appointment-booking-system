const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { randomBytes } = require('crypto');
const router = express.Router();

router.use(requireAuth);

// Provider generates check-in token for a confirmed booking
router.post('/:bookingId/token', (req, res, next) => {
  const booking = db.prepare(`
    SELECT b.*, p.owner_user_id
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    WHERE b.id = ?
  `).get(req.params.bookingId);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Only the provider owner or admin can generate tokens
  if (booking.owner_user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the provider can generate check-in tokens' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot check in a cancelled booking' });
  }

  const token = randomBytes(16).toString('hex');

  db.prepare(`
    UPDATE bookings SET checkin_token = ? WHERE id = ?
  `).run(token, booking.id);

  // Generate QR code as data URL
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const qrData = JSON.stringify({
    bookingId: booking.id,
    token,
    url: `${baseUrl}/checkin.html?token=${token}`
  });

  QRCode.toDataURL(qrData, { width: 300, margin: 2 }, (err, url) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to generate QR code' });
    }
    res.json({ token, qrUrl: url });
  });
});

// Scan/validate a check-in token
router.get('/validate/:token', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, p.name as provider_name, u.name as customer_name,
           s.name as service_name
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    JOIN users u ON u.id = b.customer_id
    JOIN services s ON s.id = b.service_id
    WHERE b.checkin_token = ?
  `).get(req.params.token);

  if (!booking) {
    return res.status(404).json({ error: 'Invalid check-in token' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking was cancelled', status: booking.status });
  }

  if (booking.status === 'checked_in') {
    return res.json({ error: 'Customer already checked in', status: booking.status, booking });
  }

  // Mark as checked in
  db.prepare(`
    UPDATE bookings SET status = 'checked_in', updated_at = datetime('now') WHERE id = ?
  `).run(booking.id);

  res.json({ message: 'Check-in successful', status: 'checked_in', booking });
});

// List bookings that need check-in (for a provider)
router.get('/pending', (req, res) => {
  const provider = db.prepare(`
    SELECT id FROM providers WHERE owner_user_id = ?
  `).get(req.user.id);

  if (!provider) {
    return res.status(403).json({ error: 'Not a provider' });
  }

  const bookings = db.prepare(`
    SELECT b.*, u.name as customer_name, s.name as service_name
    FROM bookings b
    JOIN users u ON u.id = b.customer_id
    JOIN services s ON s.id = b.service_id
    WHERE b.provider_id = ?
      AND b.status IN ('paid', 'confirmed', 'checked_in')
      AND b.start_at >= datetime('now', '-2 hours')
      AND b.end_at <= datetime('now', '+4 hours')
    ORDER BY b.start_at ASC
  `).all(provider.id);

  res.json({ bookings });
});

module.exports = router;