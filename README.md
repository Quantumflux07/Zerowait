# ZeroWait — Supermarket Queue & Checkout Management Platform

> **Branch: `develop`** (Shared foundation, database, design system, API contracts, security)

ZeroWait is an intelligent supermarket checkout and queue allocation system that streamlines retail checkouts, distributes queue loads across counters, and secures shopping cart transactions.

---

## Active Branches & Architecture

- **`develop`**: Core database schema, Supabase RLS, integer paise monetary engine, shared TypeScript types, API contracts, and tablet-first design system.
- **`queue_engine`**: Dynamic checkout queue allocation, counter load-balancing, and token display engine.
- **`cart`**: Customer smart cart interface, barcode scanning, and real-time checkout lifecycle.

*(Cashier and Manager modules are excluded per system design).*

---

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + Lucide React
- **Database & Auth**: PostgreSQL on Supabase + Row Level Security (RLS) + Supabase Realtime
- **Validation**: Zod
- **Financial Arithmetic**: Integer Paise (1 INR = 100 paise; float arithmetic forbidden)

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Run Database Migrations & Seeds
In your Supabase project (CLI or SQL Editor), apply:
1. `supabase/migrations/20261102000000_shared_foundation.sql`
2. `supabase/seed.sql`

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the tablet UI showcase, interactive design tokens, live API contracts playground, and schema explorer.

### 5. Run Tests & Validation
```bash
npm test       # Executes monetary engine unit tests
npm run lint   # Runs ESLint checks
npm run build  # Builds production Next.js bundle
```

---

## Documentation

- [Design System & UI Tokens](docs/DESIGN_SYSTEM.md)
- [Database Schema & RLS Policies](docs/DATABASE_SCHEMA.md)
- [API Contracts & Endpoints](docs/API_CONTRACTS.md)
- [Queue Allocation Algorithm](docs/QUEUE_ALGORITHM.md)
