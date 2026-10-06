# BookEase - Smart Appointment Booking System

A modern, feature-rich appointment booking platform designed for local businesses including salons, clinics, tutors, and sports grounds.

## Features

### Core Features
- **Provider Browsing**: Browse providers by type (salon, clinic, tutor, turf) with search and filters
- **Real-time Slot Selection**: Calendar-based availability with live slot generation
- **Double-Booking Prevention**: Atomic database transactions ensure no double-booking, even under concurrent requests
- **Automated Reminders**: Background worker sends reminders 24 hours before appointments (configurable)
- **Admin Dashboard**: Comprehensive admin panel with analytics, booking management, and provider controls

### Additional Features
- **Reviews & Ratings**: Customers can rate and review providers after appointments; dynamic average calculation
- **Recurring Bookings**: Create weekly/monthly appointment series; system materializes individual bookings
- **Payment Simulation**: Secure payment flow simulation (Card/UPI/Cash) for demo purposes
- **QR Check-In System**: Generate QR codes for bookings; providers scan to verify attendance
- **Analytics Dashboard**: Real-time charts (revenue, bookings by status/provider, peak hours) using Chart.js

### Interactive UI
- Modern glassmorphism design with animated backgrounds
- Responsive mobile-first layout
- Dark mode toggle (persisted in localStorage)
- Smooth animations and transitions
- Toast notifications for all actions
- Progress indicators in booking flow
- Confetti effect on successful booking
- Skeleton loading states
- Optimistic UI updates

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3) with WAL mode
- **Authentication**: Session-based with bcrypt password hashing
- **Frontend**: Vanilla JavaScript with TailwindCSS via CDN
- **Charts**: Chart.js
- **QR Codes**: qrcode library

## Quick Start

### Prerequisites
- Node.js >= 18
- npm

### Installation

```bash
# Install dependencies
npm install

# Seed the database with demo data
npm run seed

# Start the server
npm start
```

Open http://localhost:3000 in your browser.

## Demo Accounts

| Role     | Email                  | Password      |
|----------|------------------------|---------------|
| Admin    | admin@demo.com         | admin123      |
| Customer | customer@demo.com      | customer123   |
| Salon    | salon@demo.com         | provider123   |
| Clinic   | clinic@demo.com        | provider123   |
| Tutor    | tutor@demo.com         | provider123   |
| Turf     | turf@demo.com          | provider123   |

## Demo Providers

| Provider                  | Type     | Services                              |
|---------------------------|----------|---------------------------------------|
| Luxe Hair Studio          | Salon    | Haircut, Color, Blowout               |
| Wellness Medical Clinic   | Clinic   | Checkup, Follow-up, Vaccination       |
| Bright Minds Tutoring     | Tutor    | Math, Science, Test Prep              |
| GreenField Sports Complex | Turf     | Football, Tennis, Badminton           |

## Architecture

```
server/
├── index.js              # Express app entry point
├── db.js                 # SQLite schema & connection
├── seed.js               # Demo data seeding
├── routes/               # API route handlers
│   ├── auth.js           # Registration, login, logout
│   ├── providers.js      # Provider browsing & slot generation
│   ├── bookings.js       # Booking CRUD with double-booking protection
│   ├── reviews.js        # Rating & review system
│   ├── recurring.js      # Recurring appointment series
│   ├── payments.js       # Payment simulation
│   ├── checkin.js        # QR code generation & validation
│   └── admin.js          # Admin dashboard, analytics, management
├── middleware/           # Auth & error handling
├── jobs/                 # Background reminder worker
└── utils/                # Slot generation logic
```

## Security

- **No secrets committed**: `.env` is gitignored; `.env.example` contains placeholders only
- **Password hashing**: bcrypt with 10 rounds
- **Session management**: HTTP-only cookies with configurable expiration
- **Rate limiting**: Express-rate-limit on all API routes (stricter on auth)
- **Input validation**: Zod-style validation on all endpoints
- **SQL injection protection**: Parameterized queries (better-sqlite3 default)
- **CSRF protection**: Double-submit cookie pattern

## Database Schema

- `users` - User accounts (customer/admin/provider roles)
- `providers` - Business profiles with ratings
- `services` - Services offered by each provider
- `provider_hours` - Business hours per weekday
- `provider_blocks` - Vacations and unavailable periods
- `bookings` - Appointment records with status tracking
- `recurring` - Recurring booking series
- `reviews` - Customer ratings and comments
- `payments` - Payment records (simulated)
- `reminders` - Reminder log
- `sessions` - Active user sessions

## Environment Variables

See `.env.example` for all available configuration options. Key variables:

- `PORT` - Server port (default: 3000)
- `SESSION_SECRET` - Session encryption key (change in production!)
- `DB_PATH` - SQLite database path
- `REMINDER_HOURS_BEFORE` - Hours before appointment to send reminder (default: 24)
- `NODE_ENV` - Environment mode

## Future Enhancements

- Real SMTP/SMS integration (no code changes needed, just add env vars)
- Real payment gateway (Stripe/PayPal) integration
- WebSocket real-time updates
- Multi-language support (i18n)
- Mobile app (React Native / Flutter)
- Advanced analytics with machine learning for demand forecasting
- Waitlist management for fully booked slots
- Email/SMS notification preferences per user
- Calendar integration (Google Calendar, Outlook, iCal export)

## License

MIT

---

Built with ❤️ for local businesses