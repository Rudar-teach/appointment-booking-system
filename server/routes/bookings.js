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

// Booking + Payment in ONE atomic transaction (mandatory payment)
router.post('/book-and-pay', (req, res, next) => {
  const { providerId, serviceId, startAt, method, notes } = req.body;
  const customerId = req.user.id;

  if (!providerId || !serviceId || !startAt || !method) {
    throw new ValidationError('Provider, service, start time, and payment method are required');
  }

  if (!['card', 'upi', 'cash'].includes(method)) {
    throw new ValidationError('Payment method must be card, upi, or cash');
  }

  // Verify service exists and get duration + price
  const service = db.prepare('SELECT * FROM services WHERE id = ? AND provider_id = ?').get(serviceId, providerId);
  if (!service) {
    throw new ValidationError('Service not found');
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.duration_min * 60 * 1000);

  if (start < new Date()) {
    throw new ValidationError('Cannot book in the past');
  }

  // ATOMIC transaction: double-booking check + create booking + create payment
  const result = db.transaction(() => {
    // Double-booking check
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

    // Insert booking directly as 'paid'
    const bookingInfo = db.prepare(`
      INSERT INTO bookings (customer_id, provider_id, service_id, start_at, end_at, status, notes)
      VALUES (?, ?, ?, ?, ?, 'paid', ?)
    `).run(customerId, providerId, serviceId, start.toISOString(), end.toISOString(), notes || '');

    const bookingId = bookingInfo.lastInsertRowid;

    // Insert payment record
    const paymentInfo = db.prepare(`
      INSERT INTO payments (booking_id, amount_cents, status, method)
      VALUES (?, ?, 'simulated_paid', ?)
    `).run(bookingId, service.price_cents, method);

    // Update booking with payment_id
    db.prepare(`
      UPDATE bookings SET payment_id = ? WHERE id = ?
    `).run(paymentInfo.lastInsertRowid, bookingId);

    return {
      bookingId,
      paymentId: paymentInfo.lastInsertRowid
    };
  })();

  // Fetch the complete booking with joined data
  const booking = db.prepare(`
    SELECT b.*, p.name as provider_name, p.type as provider_type,
           s.name as service_name, s.duration_min, s.price_cents,
           pay.id as payment_id, pay.status as payment_status, pay.method as payment_method,
           pay.amount_cents as paid_amount, pay.created_at as payment_date
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    WHERE b.id = ?
  `).get(result.bookingId);

  res.status(201).json({
    success: true,
    booking,
    payment: {
      id: result.paymentId,
      amount_cents: service.price_cents,
      status: 'simulated_paid',
      method,
      created_at: new Date().toISOString()
    },
    message: 'Booking and payment successful!'
  });
});

// Cancel booking (refund if paid)
router.delete('/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking already cancelled' });
  }

  // If booking was paid, refund it
  if (booking.payment_id && booking.status === 'paid') {
    db.prepare(`UPDATE payments SET status = 'refunded' WHERE id = ?`).run(booking.payment_id);
  }

  db.prepare(`
    UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
  `).run(req.params.id);

  res.json({ success: true, message: booking.status === 'paid' ? 'Booking cancelled and refund processed' : 'Booking cancelled' });
});

module.exports = router;