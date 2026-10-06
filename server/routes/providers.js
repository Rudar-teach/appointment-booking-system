const express = require('express');
const db = require('../db');
const { generateDateSlots } = require('../utils/slots');
const router = express.Router();

// List providers with optional type filter and search
router.get('/', (req, res) => {
  const { type, search } = req.query;

  let query = `
    SELECT p.*, u.name as owner_name,
           (SELECT AVG(rating) FROM reviews WHERE provider_id = p.id) as avg_rating
    FROM providers p
    LEFT JOIN users u ON u.id = p.owner_user_id
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    query += ' AND p.type = ?';
    params.push(type);
  }

  if (search) {
    query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.address LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY p.rating_avg DESC';

  const providers = db.prepare(query).all(...params);

  // Enrich each provider with service count
  const enriched = providers.map(p => {
    const services = db.prepare(`
      SELECT id, name, duration_min, price_cents FROM services WHERE provider_id = ?
    `).all(p.id);

    const rating = p.avg_rating ? Math.round(parseFloat(p.avg_rating) * 10) / 10 : p.rating_avg || 0;

    return {
      ...p,
      rating_avg: rating,
      services
    };
  });

  res.json({ providers: enriched });
});

// Get single provider with full details
router.get('/:id', (req, res) => {
  const provider = db.prepare(`
    SELECT p.*, u.name as owner_name
    FROM providers p
    LEFT JOIN users u ON u.id = p.owner_user_id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const services = db.prepare(`
    SELECT id, name, duration_min, price_cents, description FROM services WHERE provider_id = ?
  `).all(provider.id);

  const reviews = db.prepare(`
    SELECT r.*, u.name as customer_name
    FROM reviews r
    JOIN users u ON u.id = r.customer_id
    WHERE r.provider_id = ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(provider.id);

  res.json({ ...provider, services, reviews });
});

// Get available slots for a provider on a date
router.get('/:id/slots', (req, res) => {
  const { date, serviceId } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });
  }

  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  let duration = 60; // default slot duration

  if (serviceId) {
    const service = db.prepare('SELECT duration_min FROM services WHERE id = ?').get(serviceId);
    if (service) duration = service.duration_min;
  }

  const slots = generateDateSlots(provider.id, date, duration);

  res.json({ provider: { id: provider.id, name: provider.name }, date, slots });
});

// Get business hours for a provider
router.get('/:id/hours', (req, res) => {
  const hours = db.prepare(`
    SELECT * FROM provider_hours WHERE provider_id = ? ORDER BY weekday
  `).all(req.params.id);

  res.json({ hours });
});

module.exports = router;