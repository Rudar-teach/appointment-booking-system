// Generate available slots for a given date and provider
const db = require('../db');

function generateDateSlots(providerId, dateStr, serviceDurationMin) {
  // dateStr format: YYYY-MM-DD
  const date = new Date(dateStr + 'T00:00:00');
  const weekday = date.getDay(); // 0-6

  // Get provider hours for this weekday
  const hours = db.prepare(`
    SELECT open_time, close_time FROM provider_hours
    WHERE provider_id = ? AND weekday = ?
  `).all(providerId, weekday);

  if (hours.length === 0) return [];

  // Get existing bookings for this provider on this date
  const dayStart = dateStr + ' 00:00:00';
  const dayEnd = dateStr + ' 23:59:59';

  const bookings = db.prepare(`
    SELECT start_at, end_at FROM bookings
    WHERE provider_id = ?
      AND status NOT IN ('cancelled', 'no_show')
      AND start_at >= ?
      AND start_at <= ?
  `).all(providerId, dayStart, dayEnd);

  // Get blocks (vacations/breaks)
  const blocks = db.prepare(`
    SELECT start_at, end_at FROM provider_blocks
    WHERE provider_id = ?
      AND start_at <= ?
      AND end_at >= ?
  `).all(providerId, dayEnd, dayStart);

  const slots = [];

  // Generate slots in 30-minute intervals
  const SLOT_INTERVAL = 30;

  for (const hourRange of hours) {
    const [openH, openM] = hourRange.open_time.split(':').map(Number);
    const [closeH, closeM] = hourRange.close_time.split(':').map(Number);

    let currentMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    while (currentMinutes + serviceDurationMin <= closeMinutes) {
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(currentMinutes / 60), currentMinutes % 60, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + serviceDurationMin);

      // Check if slot conflicts with existing bookings
      const conflict = bookings.some(b => {
        const bStart = new Date(b.start_at);
        const bEnd = new Date(b.end_at);
        return (slotStart < bEnd && slotEnd > bStart);
      });

      // Check if slot conflicts with blocks
      const blockConflict = blocks.some(b => {
        const bStart = new Date(b.start_at);
        const bEnd = new Date(b.end_at);
        return (slotStart < bEnd && slotEnd > bStart);
      });

      // Only show future slots
      const isPast = slotStart < new Date();

      if (!conflict && !blockConflict && !isPast) {
        slots.push({
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString()
        });
      }

      currentMinutes += SLOT_INTERVAL;
    }
  }

  return slots;
}

module.exports = { generateDateSlots };