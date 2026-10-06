const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../middleware/errors');
const router = express.Router();

router.use(requireAuth);

// Create review (only after booking is completed/past)
router.post('/', (req, res, next) => {
  const { bookingId, rating, comment } = req.body;
  const customerId = req.user.id;

  if (!bookingId || !rating) {
    throw new ValidationError('Booking ID and rating are required');
  }

  if (rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const booking = db.prepare(`
    SELECT * FROM bookings WHERE id = ? AND customer_id = ? AND status NOT IN ('cancelled')
  `).get(bookingId, customerId);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Check if already reviewed
  const existing = db.prepare('SELECT id FROM reviews WHERE booking_id = ?').get(bookingId);
  if (existing) {
    return res.status(409).json({ error: 'You have already reviewed this booking' });
  }

  // Check booking has ended
  if (new Date(booking.start_at) > new Date()) {
    return res.status(400).json({ error: 'Cannot review a future booking' });
  }

  const result = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO reviews (booking_id, customer_id, provider_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = insert.run(bookingId, customerId, booking.provider_id, rating, comment || '');

    // Recalculate provider average rating
    const stats = db.prepare(`
      SELECT AVG(rating) as avg, COUNT(*) as count
      FROM reviews WHERE provider_id = ?
    `).get(booking.provider_id);

    db.prepare(`
      UPDATE providers SET rating_avg = ?, rating_count = ? WHERE id = ?
    `).run(stats.avg, stats.count, booking.provider_id);

    return info.lastInsertRowid;
  })();

  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(result);
  res.status(201).json({ review });
});

// Get reviews for a provider
router.get('/provider/:providerId', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.name as customer_name
    FROM reviews r
    JOIN users u ON u.id = r.customer_id
    WHERE r.provider_id = ?
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(req.params.providerId);

  res.json({ reviews });
});

module.exports = router;