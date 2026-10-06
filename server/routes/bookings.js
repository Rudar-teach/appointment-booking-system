const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../middleware/errors');
const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// List my bookings
router.get('/', (req, res) => {
  const { status } = req.query;
  const userId = req.user.id;

  let query = `
    SELECT b.*, p.name as provider_name, p.type as provider_type,
           s.name as service_name, s.duration_min, s.price_cents,
           pay.status as payment_status, pay.method as payment_method,
           pay.amount_cents as paid_amount
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    WHERE b.customer_id = ?
  `;
  const params = [userId];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  query += ' ORDER BY b.start_at DESC';

  const bookings = db.prepare(query).all(...params);

  res.json({ bookings });
});

// Create booking (with atomic double-booking check)
router.post('/', (req, res, next) => {
  const { providerId, serviceId, startAt } = req.body;
  const customerId = req.user.id;

  if (!providerId || !serviceId || !startAt) {
    throw new ValidationError('Provider, service, and start time are required');
  }

  // Verify service exists and get duration
  const service = db.prepare('SELECT * FROM services WHERE id = ? AND provider_id = ?').get(serviceId, providerId);
  if (!service) {
    throw new ValidationError('Service not found');
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.duration_min * 60 * 1000);

  if (start < new Date()) {
    throw new ValidationError('Cannot book in the past');
  }

  // Atomic check-and-insert to prevent double-booking
  const result = db.transaction(() => {
    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE provider_id = ?
        AND status NOT IN ('cancelled', 'no_show')
        AND start_at < ?
        AND end_at > ?
      LIMIT 1
    `).get(providerId, end.toISOString(), start.toISOString());

    if (conflict) {
      throw new Error('This time slot is no longer available');
    }

    const insert = db.prepare(`
      INSERT INTO bookings (customer_id, provider_id, service_id, start_at, end_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const info = insert.run(customerId, providerId, serviceId, start.toISOString(), end.toISOString());

    return info.lastInsertRowid;
  })();

  const booking = db.prepare(`
    SELECT b.*, p.name as provider_name, s.name as service_name, s.price_cents, s.duration_min
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
    WHERE b.id = ?
  `).get(result);

  res.status(201).json({ booking });
});

// Cancel booking
router.delete('/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking already cancelled' });
  }

  db.prepare(`
    UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
  `).run(req.params.id);

  res.json({ success: true, message: 'Booking cancelled' });
});

module.exports = router;