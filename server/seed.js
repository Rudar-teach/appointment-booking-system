const bcrypt = require('bcryptjs');
const db = require('./db');

const BCRYPT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function seed() {
  console.log('Seeding database...');

  // Check if data already exists
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (existingUsers > 0) {
    console.log('Database already seeded. Skipping.');
    process.exit(0);
  }

  // Create admin user
  const adminUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run('Admin User', 'admin@demo.com', hashPassword('admin123'), '+1234567890');

  // Create provider users + provider profiles
  const salonUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, 'provider')
  `).run('Sarah Johnson', 'salon@demo.com', hashPassword('provider123'), '+1234567891');

  const clinicUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, 'provider')
  `).run('Dr. Emily Chen', 'clinic@demo.com', hashPassword('provider123'), '+1234567892');

  const tutorUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, 'provider')
  `).run('Michael Rodriguez', 'tutor@demo.com', hashPassword('provider123'), '+1234567893');

  const turfUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, 'provider')
  `).run('GreenField Sports', 'turf@demo.com', hashPassword('provider123'), '+1234567894');

  // Create provider profiles
  const salon = db.prepare(`
    INSERT INTO providers (owner_user_id, name, type, address, description, photo_url, rating_avg, rating_count)
    VALUES (?, ?, 'salon', ?, ?, ?, ?, ?)
  `).run(salonUser.lastInsertRowid, 'Luxe Hair Studio', '123 Main St', 'Premium hair salon with experienced stylists', null, 4.5, 12);

  const clinic = db.prepare(`
    INSERT INTO providers (owner_user_id, name, type, address, description, photo_url, rating_avg, rating_count)
    VALUES (?, ?, 'clinic', ?, ?, ?, ?, ?)
  `).run(clinicUser.lastInsertRowid, 'Wellness Medical Clinic', '456 Oak Ave', 'General medicine and wellness care', null, 4.8, 24);

  const tutor = db.prepare(`
    INSERT INTO providers (owner_user_id, name, type, address, description, photo_url, rating_avg, rating_count)
    VALUES (?, ?, 'tutor', ?, ?, ?, ?, ?)
  `).run(tutorUser.lastInsertRowid, 'Bright Minds Tutoring', '789 Learning Ln', 'Expert tutoring for all subjects and levels', null, 4.6, 8);

  const turf = db.prepare(`
    INSERT INTO providers (owner_user_id, name, type, address, description, photo_url, rating_avg, rating_count)
    VALUES (?, ?, 'turf', ?, ?, ?, ?, ?)
  `).run(turfUser.lastInsertRowid, 'GreenField Sports Complex', '321 Game Dr', 'Premier sports ground and turf facilities', null, 4.3, 15);

  // Create services
  const services = [
    // Salon
    { provider_id: salon.lastInsertRowid, name: 'Haircut & Style', duration_min: 45, price_cents: 3500, description: 'Professional haircut with styling' },
    { provider_id: salon.lastInsertRowid, name: 'Color & Highlights', duration_min: 90, price_cents: 8000, description: 'Full color service with highlights' },
    { provider_id: salon.lastInsertRowid, name: 'Blowout & Treatment', duration_min: 30, price_cents: 2500, description: 'Deep conditioning treatment' },
    // Clinic
    { provider_id: clinic.lastInsertRowid, name: 'General Checkup', duration_min: 30, price_cents: 5000, description: 'Complete health examination' },
    { provider_id: clinic.lastInsertRowid, name: 'Follow-up Visit', duration_min: 20, price_cents: 3000, description: 'Follow-up consultation' },
    { provider_id: clinic.lastInsertRowid, name: 'Vaccination', duration_min: 15, price_cents: 2000, description: 'Immunization shot' },
    // Tutor
    { provider_id: tutor.lastInsertRowid, name: 'Math Tutoring', duration_min: 60, price_cents: 4000, description: 'Algebra, calculus, statistics' },
    { provider_id: tutor.lastInsertRowid, name: 'Science Tutoring', duration_min: 60, price_cents: 4500, description: 'Physics, chemistry, biology' },
    { provider_id: tutor.lastInsertRowid, name: 'Test Prep', duration_min: 90, price_cents: 6000, description: 'SAT, ACT, exam preparation' },
    // Turf
    { provider_id: turf.lastInsertRowid, name: 'Football Field', duration_min: 60, price_cents: 3000, description: 'Full field reservation' },
    { provider_id: turf.lastInsertRowid, name: 'Tennis Court', duration_min: 60, price_cents: 2500, description: 'Singles or doubles court' },
    { provider_id: turf.lastInsertRowid, name: 'Badminton Court', duration_min: 60, price_cents: 2000, description: 'Indoor badminton court' },
  ];

  for (const svc of services) {
    db.prepare(`
      INSERT INTO services (provider_id, name, duration_min, price_cents, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(svc.provider_id, svc.name, svc.duration_min, svc.price_cents, svc.description);
  }

  // Create provider business hours
  const hours = [
    // Salon: Mon-Sat 9am-6pm
    [salon.lastInsertRowid, 1, '09:00', '18:00'],
    [salon.lastInsertRowid, 2, '09:00', '18:00'],
    [salon.lastInsertRowid, 3, '09:00', '18:00'],
    [salon.lastInsertRowid, 4, '09:00', '18:00'],
    [salon.lastInsertRowid, 5, '09:00', '18:00'],
    [salon.lastInsertRowid, 6, '10:00', '16:00'],
    // Clinic: Mon-Fri 8am-5pm
    [clinic.lastInsertRowid, 1, '08:00', '17:00'],
    [clinic.lastInsertRowid, 2, '08:00', '17:00'],
    [clinic.lastInsertRowid, 3, '08:00', '17:00'],
    [clinic.lastInsertRowid, 4, '08:00', '17:00'],
    [clinic.lastInsertRowid, 5, '08:00', '17:00'],
    // Tutor: Mon-Sat 10am-8pm
    [tutor.lastInsertRowid, 1, '10:00', '20:00'],
    [tutor.lastInsertRowid, 2, '10:00', '20:00'],
    [tutor.lastInsertRowid, 3, '10:00', '20:00'],
    [tutor.lastInsertRowid, 4, '10:00', '20:00'],
    [tutor.lastInsertRowid, 5, '10:00', '20:00'],
    [tutor.lastInsertRowid, 6, '10:00', '16:00'],
    // Turf: Daily 6am-10pm
    [turf.lastInsertRowid, 0, '06:00', '22:00'],
    [turf.lastInsertRowid, 1, '06:00', '22:00'],
    [turf.lastInsertRowid, 2, '06:00', '22:00'],
    [turf.lastInsertRowid, 3, '06:00', '22:00'],
    [turf.lastInsertRowid, 4, '06:00', '22:00'],
    [turf.lastInsertRowid, 5, '06:00', '22:00'],
    [turf.lastInsertRowid, 6, '06:00', '22:00'],
  ];

  for (const h of hours) {
    db.prepare(`
      INSERT INTO provider_hours (provider_id, weekday, open_time, close_time)
      VALUES (?, ?, ?, ?)
    `).run(h[0], h[1], h[2], h[3]);
  }

  // Create a demo customer
  const customerUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, role)
    VALUES (?, ?, ?, ?, 'customer')
  `).run('Jane Customer', 'customer@demo.com', hashPassword('customer123'), '+1234567899');

  console.log('\n=== Database Seeded Successfully ===');
  console.log('\nDemo Accounts:');
  console.log('  Admin:    admin@demo.com / admin123');
  console.log('  Provider: salon@demo.com / provider123');
  console.log('  Customer: customer@demo.com / customer123');
  console.log('\nProvider Accounts:');
  console.log('  Salon:    salon@demo.com / provider123');
  console.log('  Clinic:   clinic@demo.com / provider123');
  console.log('  Tutor:    tutor@demo.com / provider123');
  console.log('  Turf:     turf@demo.com / provider123');
  console.log('\nProviders Created:');
  console.log('  1. Luxe Hair Studio (Salon)');
  console.log('  2. Wellness Medical Clinic (Clinic)');
  console.log('  3. Bright Minds Tutoring (Tutor)');
  console.log('  4. GreenField Sports Complex (Turf)');
  console.log('\nTotal Services: 12 across 4 providers');
}

seed();