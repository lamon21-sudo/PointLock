# PickRivals

A PvP sports prediction platform where users compete head-to-head with virtual currency.

## Tech Stack

- **Mobile**: React Native (Expo) with NativeWind (Tailwind CSS)
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [pnpm](https://pnpm.io/) v9 or higher
- [Docker](https://www.docker.com/) (for database)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (for mobile)

## Quick Start

### 1. Clone and Install Dependencies

```bash
cd pick-rivals

# Install pnpm if you don't have it
npm install -g pnpm

# Install all dependencies
pnpm install
```

### 2. Start Database Services

```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d

# Verify containers are running
docker-compose ps
```

### 3. Setup Database

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database (development)
pnpm db:push

# Or run migrations (production)
# pnpm db:migrate
```

### 4. Start the Backend API

```bash
# In a terminal window
pnpm dev:api

# API will be available at http://localhost:3000
# Health check: http://localhost:3000/health
# Events API: http://localhost:3000/api/v1/events
```

### 5. Start the Mobile App

```bash
# In another terminal window
pnpm dev:mobile

# This will start Expo Dev Server
# Press 'i' for iOS Simulator
# Press 'a' for Android Emulator
# Or scan QR code with Expo Go app on physical device
```

## Project Structure

```
pick-rivals/
├── apps/
│   ├── api/          # Node.js Express backend
│   └── mobile/       # React Native Expo app
├── packages/
│   └── shared-types/ # Shared TypeScript types
├── docs/             # Documentation
└── docker-compose.yml
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Start all apps in development mode |
| `pnpm dev:api` | Start only the backend API |
| `pnpm dev:mobile` | Start only the mobile app |
| `pnpm build` | Build all apps |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Prisma Studio GUI |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/events` | List upcoming sports events |
| GET | `/api/v1/events/:id` | Get single event details |
| GET | `/api/v1/events?sport=NFL` | Filter events by sport |

## Environment Variables

Copy `.env.example` to `.env` in `apps/api/`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/pickrivals"
JWT_ACCESS_SECRET="your-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=3000
NODE_ENV=development
```

## Development Notes

- The mobile app connects to `http://localhost:3000/api/v1` by default
- For physical device testing, update the API URL to your machine's IP
- Mock data is used for events (no external API key needed for MVP)

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and database schema
- [PHASE_1_PLAN.md](./PHASE_1_PLAN.md) - MVP implementation plan

## License

Private - All rights reserved
