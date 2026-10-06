// Reminder worker - runs every 60 seconds to send automated reminders
const db = require('../db');

const REMINDER_HOURS_BEFORE = parseInt(process.env.REMINDER_HOURS_BEFORE) || 24;

function checkAndSendReminders() {
  try {
    const now = new Date();
    const reminderStart = new Date(now.getTime() + (REMINDER_HOURS_BEFORE - 0.5) * 60 * 60 * 1000);
    const reminderEnd = new Date(now.getTime() + (REMINDER_HOURS_BEFORE + 0.5) * 60 * 60 * 1000);

    // Find bookings needing reminders that haven't been reminded recently
    const upcoming = db.prepare(`
      SELECT b.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             p.name as provider_name, s.name as service_name, s.duration_min
      FROM bookings b
      JOIN users u ON u.id = b.customer_id
      JOIN providers p ON p.id = b.provider_id
      JOIN services s ON s.id = b.service_id
      WHERE b.status NOT IN ('cancelled', 'no_show')
        AND b.start_at >= ?
        AND b.start_at <= ?
        AND b.id NOT IN (
          SELECT booking_id FROM reminders
          WHERE sent_at >= datetime('now', '-12 hours')
        )
      LIMIT 100
    `).all(reminderStart.toISOString(), reminderEnd.toISOString());

    for (const booking of upcoming) {
      const startTime = new Date(booking.start_at);
      const hoursUntil = Math.round((startTime - now) / (1000 * 60 * 60));
      const durationStr = `${booking.duration_min} min`;

      const emailContent = `Hello ${booking.customer_name},\n\nThis is a reminder that your ${booking.service_name} appointment at ${booking.provider_name} is in ${hoursUntil} hour(s).\n\nDetails:\n- Service: ${booking.service_name}\n- Provider: ${booking.provider_name}\n- Start: ${startTime.toLocaleString()}\n- Duration: ${durationStr}\n\nPlease arrive 5 minutes early. Reply STOP to cancel.`;

      const smsContent = `Reminder: ${booking.service_name} at ${booking.provider_name} in ${hoursUntil}h (${startTime.toLocaleString()}). Reply STOP to cancel.`;

      // Log reminder (in production, this would send actual email/SMS)
      console.log(`[REMINDER EMAIL] To: ${booking.customer_email} | ${emailContent}`);
      console.log(`[REMINDER SMS] To: ${booking.customer_phone || 'N/A'} | ${smsContent}`);

      db.prepare(`
        INSERT INTO reminders (booking_id, channel, status, content)
        VALUES (?, 'email', 'sent', ?)
      `).run(booking.id, emailContent);

      if (booking.customer_phone) {
        db.prepare(`
          INSERT INTO reminders (booking_id, channel, status, content)
          VALUES (?, 'sms', 'sent', ?)
        `).run(booking.id, smsContent);
      }
    }

    if (upcoming.length > 0) {
      console.log(`[REMINDER WORKER] Sent ${upcoming.length} reminder(s) at ${now.toISOString()}`);
    }
  } catch (err) {
    console.error('[REMINDER WORKER] Error:', err);
  }
}

// Run immediately on start, then every 60 seconds
console.log('[REMINDER WORKER] Starting...');
checkAndSendReminders();
setInterval(checkAndSendReminders, 60000);

module.exports = { checkAndSendReminders };