const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../middleware/errors');
const router = express.Router();

router.use(requireAuth);

// Simulate payment for a booking
router.post('/pay', (req, res, next) => {
  const { bookingId, method } = req.body;

  if (!bookingId) {
    throw new ValidationError('Booking ID is required');
  }

  if (!['card', 'upi', 'cash'].includes(method)) {
    throw new ValidationError('Payment method must be card, upi, or cash');
  }

  const booking = db.prepare(`
    SELECT b.*, s.price_cents, s.name as service_name, p.name as provider_name
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN providers p ON p.id = b.provider_id
    WHERE b.id = ? AND b.customer_id = ? AND b.status NOT IN ('cancelled')
  `).get(bookingId, req.user.id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Check if already paid
  const existingPayment = db.prepare('SELECT * FROM payments WHERE booking_id = ?').get(bookingId);
  if (existingPayment && existingPayment.status === 'simulated_paid') {
    return res.status(409).json({ error: 'Payment already completed' });
  }

  // Simulate payment processing (no real network calls)
  const payment = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO payments (booking_id, amount_cents, status, method)
      VALUES (?, ?, 'simulated_paid', ?)
    `).run(bookingId, booking.price_cents, method);

    db.prepare(`
      UPDATE bookings SET status = 'paid', payment_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(result.lastInsertRowid, bookingId);

    return result.lastInsertRowid;
  })();

  const paymentRecord = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment);

  res.json({
    success: true,
    payment: paymentRecord,
    amount: (booking.price_cents / 100).toFixed(2),
    service: booking.service_name,
    provider: booking.provider_name,
    start_at: booking.start_at,
    end_at: booking.end_at,
    bookingId: booking.id
  });
});

// Simulate refund
router.post('/refund/:bookingId', (req, res, next) => {
  const booking = db.prepare(`
    SELECT b.*, pay.id as payment_id
    FROM bookings b
    LEFT JOIN payments pay ON pay.booking_id = b.id
    WHERE b.id = ? AND b.customer_id = ?
  `).get(req.params.bookingId, req.user.id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.payment_id) {
    db.prepare(`UPDATE payments SET status = 'refunded' WHERE id = ?`).run(booking.payment_id);
  }

  db.prepare(`UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(booking.id);

  res.json({ success: true, message: 'Refund processed (simulated)' });
});

module.exports = router;