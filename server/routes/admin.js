const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { ValidationError } = require('../middleware/errors');
const router = express.Router();

// All routes require admin
router.use(requireAdmin);

// Dashboard stats
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalProviders = db.prepare('SELECT COUNT(*) as count FROM providers').get().count;
  const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  const totalRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE status = 'simulated_paid'
  `).get().total;

  const pendingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'").get().count;
  const confirmedBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status IN ('confirmed', 'paid')").get().count;
  const cancelledBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'cancelled'").get().count;
  const checkedIn = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'checked_in'").get().count;
  const noShows = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'no_show'").get().count;

  const revenueThisMonth = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments
    WHERE status = 'simulated_paid'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get().total;

  const revenueLastMonth = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments
    WHERE status = 'simulated_paid'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')
  `).get().total;

  res.json({
    users: totalUsers,
    providers: totalProviders,
    bookings: totalBookings,
    revenue: totalRevenue / 100,
    revenueThisMonth: revenueThisMonth / 100,
    revenueLastMonth: revenueLastMonth / 100,
    statusBreakdown: {
      pending: pendingBookings,
      confirmed: confirmedBookings,
      cancelled: cancelledBookings,
      checkedIn,
      noShows
    }
  });
});

// Get bookings with filters
router.get('/bookings', (req, res) => {
  const { status, providerId, fromDate, toDate } = req.query;

  let query = `
    SELECT b.*, u.name as customer_name, u.email as customer_email,
           p.name as provider_name, p.type as provider_type,
           s.name as service_name, s.price_cents,
           pay.status as payment_status, pay.method as payment_method
    FROM bookings b
    JOIN users u ON u.id = b.customer_id
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  if (providerId) {
    query += ' AND b.provider_id = ?';
    params.push(parseInt(providerId));
  }

  if (fromDate) {
    query += ' AND b.start_at >= ?';
    params.push(fromDate + ' 00:00:00');
  }

  if (toDate) {
    query += ' AND b.start_at <= ?';
    params.push(toDate + ' 23:59:59');
  }

  query += ' ORDER BY b.created_at DESC LIMIT 500';

  const bookings = db.prepare(query).all(...params);
  res.json({ bookings });
});

// Get revenue analytics (30-day chart data)
router.get('/analytics/revenue', (req, res) => {
  const days = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', created_at) as date,
      SUM(amount_cents) as daily_revenue,
      COUNT(*) as daily_bookings
    FROM payments
    WHERE status = 'simulated_paid'
      AND created_at >= datetime('now', '-30 days')
    GROUP BY strftime('%Y-%m-%d', created_at)
    ORDER BY date ASC
  `).all();

  const bookingsByProvider = db.prepare(`
    SELECT p.name, COUNT(b.id) as count
    FROM bookings b
    JOIN providers p ON p.id = b.provider_id
    WHERE b.created_at >= datetime('now', '-30 days')
    GROUP BY p.id
    ORDER BY count DESC
    LIMIT 10
  `).all();

  const bookingsByStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM bookings
    GROUP BY status
  `).all();

  const peakHours = db.prepare(`
    SELECT strftime('%H', start_at) as hour, COUNT(*) as count
    FROM bookings
    GROUP BY hour
    ORDER BY count DESC
  `).all();

  res.json({
    dailyRevenue: days,
    byProvider: bookingsByProvider,
    byStatus: bookingsByStatus,
    peakHours
  });
});

// Provider management
router.get('/providers', (req, res) => {
  const providers = db.prepare(`
    SELECT p.*, u.name as owner_name,
           (SELECT COUNT(*) FROM services WHERE provider_id = p.id) as service_count,
           (SELECT COUNT(*) FROM bookings WHERE provider_id = p.id) as booking_count
    FROM providers p
    LEFT JOIN users u ON u.id = p.owner_user_id
    ORDER BY p.created_at DESC
  `).all();
  res.json({ providers });
});

router.post('/providers', (req, res) => {
  const { name, type, address, description, phone } = req.body;

  if (!name || !type) {
    throw new ValidationError('Name and type are required');
  }

  const result = db.prepare(`
    INSERT INTO providers (name, type, address, description, photo_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, type, address || '', description || '', null);

  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ provider });
});

// Service management
router.post('/services', (req, res) => {
  const { providerId, name, durationMin, priceCents, description } = req.body;

  if (!providerId || !name || !durationMin || priceCents === undefined) {
    throw new ValidationError('Provider, name, duration, and price are required');
  }

  const result = db.prepare(`
    INSERT INTO services (provider_id, name, duration_min, price_cents, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(providerId, name, durationMin, priceCents, description || '');

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ service });
});

// Business hours management
router.post('/hours', (req, res) => {
  const { providerId, weekday, openTime, closeTime } = req.body;

  if (weekday === undefined || !openTime || !closeTime) {
    throw new ValidationError('Weekday, open time, and close time are required');
  }

  db.prepare(`
    INSERT OR REPLACE INTO provider_hours (provider_id, weekday, open_time, close_time)
    VALUES (?, ?, ?, ?)
  `).run(providerId, weekday, openTime, closeTime);

  res.json({ success: true });
});

// Manual reminder trigger (for demo)
router.post('/reminders/send', (req, res) => {
  const now = new Date();
  const reminderWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Next 24 hours

  const upcoming = db.prepare(`
    SELECT b.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
           p.name as provider_name, s.name as service_name, s.duration_min
    FROM bookings b
    JOIN users u ON u.id = b.customer_id
    JOIN providers p ON p.id = b.provider_id
    JOIN services s ON s.id = b.service_id
    WHERE b.status NOT IN ('cancelled', 'no_show')
      AND b.start_at >= datetime('now')
      AND b.start_at <= ?
      AND b.id NOT IN (SELECT booking_id FROM reminders WHERE sent_at >= datetime('now', '-12 hours'))
    LIMIT 50
  `).all(reminderWindow.toISOString());

  let sentCount = 0;

  for (const booking of upcoming) {
    const startTime = new Date(booking.start_at);
    const hoursUntil = Math.round((startTime - now) / (1000 * 60 * 60));
    const durationStr = `${booking.duration_min} minutes`;

    const content = `Reminder: Your ${booking.service_name} appointment at ${booking.provider_name} is in ${hoursUntil} hour(s). Starts at ${startTime.toLocaleString()}. Duration: ${durationStr}.`;

    db.prepare(`
      INSERT INTO reminders (booking_id, channel, status, content)
      VALUES (?, 'email', 'sent', ?)
    `).run(booking.id, content);

    sentCount++;
  }

  res.json({
    success: true,
    remindersSent: sentCount,
    message: sentCount > 0
      ? `${sentCount} reminder(s) sent (check server console for details)`
      : 'No upcoming bookings found in the reminder window'
  });
});

// Update booking status (admin override)
router.put('/bookings/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'paid', 'cancelled', 'checked_in', 'no_show'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = db.prepare(`
    UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  res.json({ success: true, message: `Status updated to ${status}` });
});

// Block provider time (vacation/break)
router.post('/blocks', (req, res) => {
  const { providerId, startAt, endAt, reason } = req.body;

  db.prepare(`
    INSERT INTO provider_blocks (provider_id, start_at, end_at, reason)
    VALUES (?, ?, ?, ?)
  `).run(providerId, startAt, endAt, reason || 'Blocked');

  res.json({ success: true, message: 'Time block added' });
});

module.exports = router;