const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../middleware/errors');
const router = express.Router();

router.use(requireAuth);

// Book and pay in a single mandatory transaction
router.post('/book-and-pay', (req, res, next) => {
  const { providerId, serviceId, startAt, method, notes } = req.body;
  const customerId = req.user.id;

  if (!providerId || !serviceId || !startAt || !method) {
    throw new ValidationError('Provider, service, start time, and payment method are required');
  }

  if (!['card', 'upi', 'cash'].includes(method)) {
    throw new ValidationError('Payment method must be card, upi, or cash');
  }

  // Verify service exists
  const service = db.prepare('SELECT * FROM services WHERE id = ? AND provider_id = ?').get(serviceId, providerId);
  if (!service) {
    throw new ValidationError('Service not found');
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.duration_min * 60 * 1000);

  if (start < new Date()) {
    throw new ValidationError('Cannot book in the past');
  }

  // ATOMIC transaction: check conflict + create booking (as 'paid') + create payment
  const result = db.transaction(() => {
    // Double-booking protection
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

    // Insert booking as 'paid' directly — no pending state
    const bookingInfo = db.prepare(`
      INSERT INTO bookings (customer_id, provider_id, service_id, start_at, end_at, status, notes)
      VALUES (?, ?, ?, ?, ?, 'paid', ?)
    `).run(customerId, providerId, serviceId, start.toISOString(), end.toISOString(), notes || '');

    const bookingId = bookingInfo.lastInsertRowid;

    // Create payment record
    const paymentInfo = db.prepare(`
      INSERT INTO payments (booking_id, amount_cents, status, method)
      VALUES (?, ?, 'simulated_paid', ?)
    `).run(bookingId, service.price_cents, method);

    // Link payment to booking
    db.prepare(`UPDATE bookings SET payment_id = ? WHERE id = ?`).run(paymentInfo.lastInsertRowid, bookingId);

    return { bookingId, paymentId: paymentInfo.lastInsertRowid };
  })();

  // Fetch full booking details
  const booking = db.prepare(`
    SELECT b.*, p.name as provider_name, p.type as provider_type,
           s.name as service_name, s.duration_min, s.price_cents
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
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
    message: 'Payment successful! Booking confirmed.'
  });
});

// Full payment history for the logged-in customer
router.get('/history', (req, res) => {
  const userId = req.user.id;
  const { fromDate, toDate, method } = req.query;

  // Get all paid bookings with payment details
  let query = `
    SELECT
      b.id as booking_id,
      b.start_at,
      b.end_at,
      b.status as booking_status,
      b.created_at as booking_date,
      pay.id as payment_id,
      pay.amount_cents,
      pay.status as payment_status,
      pay.method as payment_method,
      pay.created_at as payment_date,
      p.name as provider_name,
      p.type as provider_type,
      p.address as provider_address,
      s.name as service_name,
      s.duration_min
    FROM bookings b
    JOIN payments pay ON pay.booking_id = b.id
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
    WHERE b.customer_id = ?
      AND pay.status = 'simulated_paid'
  `;
  const params = [userId];

  if (fromDate) {
    query += ' AND pay.created_at >= ?';
    params.push(fromDate + ' 00:00:00');
  }
  if (toDate) {
    query += ' AND pay.created_at <= ?';
    params.push(toDate + ' 23:59:59');
  }
  if (method) {
    query += ' AND pay.method = ?';
    params.push(method);
  }

  query += ' ORDER BY pay.created_at DESC';

  const payments = db.prepare(query).all(...params);

  // Calculate stats
  const totalSpent = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const totalBookings = payments.length;

  // Average order value
  const avgOrderValue = totalBookings > 0 ? Math.round(totalSpent / totalBookings) : 0;

  // Spending by provider
  const byProvider = {};
  payments.forEach(p => {
    if (!byProvider[p.provider_name]) {
      byProvider[p.provider_name] = { count: 0, total: 0 };
    }
    byProvider[p.provider_name].count++;
    byProvider[p.provider_name].total += p.amount_cents;
  });

  // Spending by month
  const byMonth = {};
  payments.forEach(p => {
    const month = p.payment_date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = 0;
    byMonth[month] += p.amount_cents;
  });

  // Payment method breakdown
  const byMethod = {};
  payments.forEach(p => {
    if (!byMethod[p.payment_method]) byMethod[p.payment_method] = 0;
    byMethod[p.payment_method] += p.amount_cents;
  });

  res.json({
    payments,
    stats: {
      totalSpent,
      totalSpentFormatted: `$${(totalSpent / 100).toFixed(2)}`,
      totalBookings,
      avgOrderValue,
      avgOrderValueFormatted: `$${(avgOrderValue / 100).toFixed(2)}`,
      firstOrder: payments.length > 0 ? payments[payments.length - 1].payment_date : null,
      lastOrder: payments.length > 0 ? payments[0].payment_date : null
    },
    breakdown: {
      byProvider,
      byMonth,
      byMethod
    }
  });
});

// Refund a payment
router.post('/refund/:bookingId', (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, pay.id as payment_id, pay.amount_cents
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

  res.json({ success: true, message: 'Refund processed', refundAmount: booking.amount_cents || 0 });
});

module.exports = router;