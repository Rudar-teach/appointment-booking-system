const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { generateDateSlots } = require('../utils/slots');
const { ValidationError } = require('../middleware/errors');
const router = express.Router();

router.use(requireAuth);

// Create recurring booking series
router.post('/', (req, res, next) => {
  const { providerId, serviceId, weekday, time, untilDate } = req.body;
  const customerId = req.user.id;

  if (!providerId || !serviceId || weekday === undefined || !time || !untilDate) {
    throw new ValidationError('Provider, service, weekday, time, and until date are required');
  }

  if (weekday < 0 || weekday > 6) {
    throw new ValidationError('Weekday must be 0 (Sunday) to 6 (Saturday)');
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND provider_id = ?').get(serviceId, providerId);
  if (!service) {
    throw new ValidationError('Service not found');
  }

  const until = new Date(untilDate + 'T23:59:59');
  if (until < new Date()) {
    throw new ValidationError('Until date must be in the future');
  }

  db.prepare(`
    INSERT INTO recurring (customer_id, provider_id, service_id, weekday, time, until_date, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(customerId, providerId, serviceId, weekday, time, untilDate);

  // Materialize individual bookings from this recurring series
  materializeRecurringBookings(customerId, providerId, serviceId, weekday, time, untilDate);

  res.status(201).json({ success: true, message: 'Recurring bookings created' });
});

// List my recurring series
router.get('/', (req, res) => {
  const series = db.prepare(`
    SELECT r.*, p.name as provider_name, s.name as service_name, s.price_cents
    FROM recurring r
    JOIN providers p ON p.id = r.provider_id
    JOIN services s ON s.id = r.service_id
    WHERE r.customer_id = ? AND r.active = 1
    ORDER BY r.created_at DESC
  `).all(req.user.id);

  res.json({ series });
});

// Cancel recurring series
router.delete('/:id', (req, res) => {
  const series = db.prepare('SELECT * FROM recurring WHERE id = ? AND customer_id = ?').get(req.params.id, req.user.id);

  if (!series) {
    return res.status(404).json({ error: 'Recurring series not found' });
  }

  db.prepare('UPDATE recurring SET active = 0 WHERE id = ?').run(req.params.id);

  res.json({ success: true, message: 'Recurring bookings cancelled' });
});

// Materialize individual bookings from a recurring series
function materializeRecurringBookings(customerId, providerId, serviceId, weekday, time, untilDate) {
  const service = db.prepare('SELECT duration_min, price_cents FROM services WHERE id = ?').get(serviceId);
  const until = new Date(untilDate + 'T23:59:59');
  const today = new Date();

  let date = new Date(today);
  date.setHours(0, 0, 0, 0);

  // Find next occurrence of this weekday
  let daysUntilNext = (weekday - date.getDay() + 7) % 7;
  if (daysUntilNext === 0 && new Date() > new Date(date.toISOString().slice(0, 10) + 'T' + time)) {
    daysUntilNext = 7;
  }
  date.setDate(date.getDate() + daysUntilNext);

  let created = 0;
  let skipped = 0;

  while (date <= until) {
    const [hours, minutes] = time.split(':').map(Number);
    const startAt = new Date(date);
    startAt.setHours(hours, minutes, 0, 0);

    const endAt = new Date(startAt.getTime() + service.duration_min * 60 * 1000);

    // Check for conflicts (skip conflicting slots)
    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE provider_id = ?
        AND status NOT IN ('cancelled', 'no_show')
        AND start_at < ?
        AND end_at > ?
    `).get(providerId, endAt.toISOString(), startAt.toISOString());

    if (!conflict) {
      db.prepare(`
        INSERT INTO bookings (customer_id, provider_id, service_id, start_at, end_at, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(customerId, providerId, serviceId, startAt.toISOString(), endAt.toISOString());
      created++;
    } else {
      skipped++;
    }

    date.setDate(date.getDate() + 7); // Next week
  }

  console.log(`Recurring materialization: created=${created}, skipped=${skipped}`);
}

module.exports = router;