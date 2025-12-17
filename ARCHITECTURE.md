# PickRivals Architecture Document

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [System Architecture](#system-architecture)
4. [Database Schema](#database-schema)
5. [Monorepo Folder Structure](#monorepo-folder-structure)
6. [API Design](#api-design)
7. [Security & Compliance](#security--compliance)
8. [Third-Party Integrations](#third-party-integrations)

---

## Overview

PickRivals is a skill-based PvP sports prediction platform. Users build prediction "slips" (parlays) and compete head-to-head against friends or matched opponents using virtual currency (Rival Coins). The platform is NOT gambling—it operates as a skill-based competition where users compete against each other, not the house.

### Core Principles
- **PvP Model**: Users compete against each other, not the platform
- **Virtual Currency**: Rival Coins (RC) with no direct cash-out (initially)
- **Skill-Based**: Sports prediction recognized as skill under fantasy sports legislation
- **Social-First**: Friends, chat, leaderboards, and social sharing

---

## Tech Stack

### Frontend (Mobile)
| Technology | Purpose |
|------------|---------|
| **React Native (Expo)** | Cross-platform mobile development (iOS/Android) |
| **Expo Router** | File-based navigation |
| **React Query / TanStack Query** | Server state management, caching |
| **Zustand** | Client-side state management |
| **NativeWind** | Tailwind CSS for React Native styling |
| **React Native Reanimated** | Smooth animations for live updates |
| **Socket.io Client** | Real-time websocket connections |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **TypeScript** | Type safety across the stack |
| **Express.js** | REST API framework |
| **Socket.io** | Real-time bidirectional communication |
| **Bull / BullMQ** | Job queues for settlement, notifications |
| **Zod** | Runtime schema validation |
| **Prisma** | Type-safe ORM for PostgreSQL |

### Database & Caching
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database (transactions, ledger, users) |
| **Redis** | Caching (odds, sessions), leaderboards, pub/sub |
| **Firebase Firestore** | Chat messages, social feeds (optional Phase 2+) |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **AWS / GCP** | Cloud hosting |
| **Docker** | Containerization |
| **GitHub Actions** | CI/CD pipelines |
| **Vercel / Railway** | Backend deployment (MVP) |
| **Expo EAS** | Mobile app builds and OTA updates |

### Monitoring & Analytics
| Technology | Purpose |
|------------|---------|
| **Sentry** | Error tracking |
| **Mixpanel / Amplitude** | Product analytics |
| **Datadog / CloudWatch** | Infrastructure monitoring |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   iOS App       │  │  Android App    │  │  Web (Future)   │              │
│  │  (React Native) │  │  (React Native) │  │  (Next.js)      │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     API Gateway /       │
                    │     Load Balancer       │
                    └────────────┬────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                         SERVICE LAYER                                        │
│                                │                                             │
│    ┌───────────────────────────┼───────────────────────────────┐            │
│    │                           │                               │            │
│    ▼                           ▼                               ▼            │
│ ┌──────────┐            ┌──────────────┐              ┌──────────────┐      │
│ │ REST API │            │  WebSocket   │              │  Job Workers │      │
│ │ Server   │            │   Server     │              │  (BullMQ)    │      │
│ └────┬─────┘            └──────┬───────┘              └──────┬───────┘      │
│      │                         │                             │              │
│      └─────────────────────────┼─────────────────────────────┘              │
│                                │                                             │
│    ┌───────────────────────────┼───────────────────────────────┐            │
│    │                    DOMAIN SERVICES                        │            │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │            │
│    │  │  Auth   │ │ Wallet  │ │  Match  │ │  Slip   │         │            │
│    │  │ Service │ │ Service │ │ Service │ │ Service │         │            │
│    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │            │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │            │
│    │  │ Sports  │ │ Social  │ │ Settle- │ │  Risk   │         │            │
│    │  │  Data   │ │ Service │ │  ment   │ │ Engine  │         │            │
│    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │            │
│    └───────────────────────────────────────────────────────────┘            │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────────────────┐
│                          DATA LAYER                                          │
│                                 │                                            │
│    ┌────────────────────────────┼────────────────────────────┐              │
│    │                            │                            │              │
│    ▼                            ▼                            ▼              │
│ ┌──────────────┐        ┌──────────────┐         ┌──────────────┐           │
│ │  PostgreSQL  │        │    Redis     │         │  Firestore   │           │
│ │  (Primary)   │        │   (Cache)    │         │   (Chat)     │           │
│ │              │        │              │         │              │           │
│ │ • Users      │        │ • Sessions   │         │ • Messages   │           │
│ │ • Wallets    │        │ • Odds Cache │         │ • Feeds      │           │
│ │ • Slips      │        │ • Leaderboard│         │ • Reactions  │           │
│ │ • Matches    │        │ • Pub/Sub    │         │              │           │
│ │ • Txns       │        │              │         │              │           │
│ └──────────────┘        └──────────────┘         └──────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────────────────┐
│                     EXTERNAL SERVICES                                        │
│    ┌────────────────────────────┼────────────────────────────┐              │
│    │                            │                            │              │
│    ▼                            ▼                            ▼              │
│ ┌──────────────┐        ┌──────────────┐         ┌──────────────┐           │
│ │  SportRadar  │        │  App Store   │         │   Veriff     │           │
│ │  / OddsAPI   │        │ IAP (Apple/  │         │   (KYC)      │           │
│ │              │        │   Google)    │         │              │           │
│ └──────────────┘        └──────────────┘         └──────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram (Conceptual)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   USERS     │───────│   WALLETS   │───────│TRANSACTIONS │
└─────────────┘       └─────────────┘       └─────────────┘
       │                                           │
       │              ┌─────────────┐              │
       └──────────────│   MATCHES   │──────────────┘
                      └─────────────┘
                             │
                      ┌─────────────┐
                      │    SLIPS    │
                      └─────────────┘
                             │
                      ┌─────────────┐
                      │ SLIP_PICKS  │
                      └─────────────┘
                             │
                      ┌─────────────┐
                      │SPORTS_EVENTS│
                      └─────────────┘
```

### SQL Schema

```sql
-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE user_status AS ENUM ('active', 'suspended', 'banned', 'pending_verification');
CREATE TYPE transaction_type AS ENUM (
    'purchase',           -- IAP token purchase
    'bonus',              -- Free tokens (weekly allowance, referral)
    'match_entry',        -- Deducted when entering a match
    'match_win',          -- Credited on match win
    'match_refund',       -- Refunded if match cancelled
    'rake_fee',           -- Platform fee deduction
    'utility_purchase',   -- Streak freeze, boosts, etc.
    'adjustment'          -- Admin adjustment
);
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
CREATE TYPE match_status AS ENUM ('pending', 'active', 'settled', 'cancelled', 'disputed');
CREATE TYPE match_type AS ENUM ('private', 'public');
CREATE TYPE slip_status AS ENUM ('pending', 'active', 'won', 'lost', 'push', 'cancelled');
CREATE TYPE pick_status AS ENUM ('pending', 'won', 'lost', 'push', 'cancelled');
CREATE TYPE pick_type AS ENUM ('moneyline', 'spread', 'total', 'prop');
CREATE TYPE sport_type AS ENUM ('NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'NCAAF', 'NCAAB');


-- =====================================================
-- USERS TABLE
-- =====================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Authentication
    email               VARCHAR(255) UNIQUE NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    email_verified      BOOLEAN DEFAULT FALSE,
    email_verified_at   TIMESTAMP WITH TIME ZONE,

    -- Profile
    username            VARCHAR(50) UNIQUE NOT NULL,
    display_name        VARCHAR(100),
    avatar_url          VARCHAR(500),
    bio                 VARCHAR(500),

    -- Status & Verification
    status              user_status DEFAULT 'pending_verification',
    kyc_verified        BOOLEAN DEFAULT FALSE,
    kyc_verified_at     TIMESTAMP WITH TIME ZONE,
    kyc_provider_id     VARCHAR(255),          -- External KYC provider reference

    -- Location (for geofencing compliance)
    country_code        CHAR(2),
    state_code          VARCHAR(10),
    timezone            VARCHAR(50),

    -- Skill Rating (ELO-based)
    skill_rating        INTEGER DEFAULT 1000,
    matches_played      INTEGER DEFAULT 0,
    matches_won         INTEGER DEFAULT 0,
    current_streak      INTEGER DEFAULT 0,
    best_streak         INTEGER DEFAULT 0,

    -- Referral
    referral_code       VARCHAR(20) UNIQUE,
    referred_by_id      UUID REFERENCES users(id),

    -- Device & Push
    fcm_token           VARCHAR(500),          -- Firebase Cloud Messaging
    apns_token          VARCHAR(500),          -- Apple Push Notification Service

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at       TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_skill_rating ON users(skill_rating);
CREATE INDEX idx_users_status ON users(status);


-- =====================================================
-- WALLETS TABLE
-- =====================================================

CREATE TABLE wallets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Balances (stored in smallest unit: 1 RC = 1)
    -- Separate buckets for compliance (paid vs free coins)
    paid_balance        BIGINT DEFAULT 0 CHECK (paid_balance >= 0),
    bonus_balance       BIGINT DEFAULT 0 CHECK (bonus_balance >= 0),

    -- Computed total (for convenience, maintained by triggers)
    total_balance       BIGINT GENERATED ALWAYS AS (paid_balance + bonus_balance) STORED,

    -- Lifetime stats
    total_deposited     BIGINT DEFAULT 0,      -- Total RC purchased
    total_won           BIGINT DEFAULT 0,      -- Total RC won in matches
    total_lost          BIGINT DEFAULT 0,      -- Total RC lost in matches
    total_rake_paid     BIGINT DEFAULT 0,      -- Total rake fees paid

    -- Weekly allowance tracking
    last_allowance_at   TIMESTAMP WITH TIME ZONE,

    -- Locking for concurrent transactions
    version             INTEGER DEFAULT 1,

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);


-- =====================================================
-- TRANSACTIONS TABLE (Immutable Ledger)
-- =====================================================

CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES wallets(id),
    user_id             UUID NOT NULL REFERENCES users(id),

    -- Transaction details
    type                transaction_type NOT NULL,
    status              transaction_status DEFAULT 'pending',

    -- Amounts (positive = credit, negative = debit)
    amount              BIGINT NOT NULL,
    paid_amount         BIGINT DEFAULT 0,      -- Portion from paid_balance
    bonus_amount        BIGINT DEFAULT 0,      -- Portion from bonus_balance

    -- Balance snapshots (for audit trail)
    balance_before      BIGINT NOT NULL,
    balance_after       BIGINT NOT NULL,

    -- References
    match_id            UUID REFERENCES matches(id),
    iap_receipt_id      VARCHAR(500),          -- App Store / Play Store receipt
    external_ref        VARCHAR(255),          -- External reference ID

    -- Metadata
    description         VARCHAR(500),
    metadata            JSONB DEFAULT '{}',

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at        TIMESTAMP WITH TIME ZONE,

    -- Idempotency key to prevent duplicate transactions
    idempotency_key     VARCHAR(255) UNIQUE
);

CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_match_id ON transactions(match_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);


-- =====================================================
-- SPORTS EVENTS TABLE (External Data Cache)
-- =====================================================

CREATE TABLE sports_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id         VARCHAR(100) UNIQUE NOT NULL,  -- SportRadar/OddsAPI ID

    -- Event details
    sport               sport_type NOT NULL,
    league              VARCHAR(100) NOT NULL,

    -- Teams
    home_team_id        VARCHAR(100) NOT NULL,
    home_team_name      VARCHAR(100) NOT NULL,
    away_team_id        VARCHAR(100) NOT NULL,
    away_team_name      VARCHAR(100) NOT NULL,

    -- Timing
    scheduled_at        TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at          TIMESTAMP WITH TIME ZONE,
    ended_at            TIMESTAMP WITH TIME ZONE,

    -- Scores
    home_score          INTEGER,
    away_score          INTEGER,

    -- Status
    status              VARCHAR(50) DEFAULT 'scheduled',  -- scheduled, in_progress, final, postponed, cancelled

    -- Odds (cached, updated frequently)
    odds_data           JSONB DEFAULT '{}',
    odds_updated_at     TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sports_events_external_id ON sports_events(external_id);
CREATE INDEX idx_sports_events_sport ON sports_events(sport);
CREATE INDEX idx_sports_events_scheduled_at ON sports_events(scheduled_at);
CREATE INDEX idx_sports_events_status ON sports_events(status);


-- =====================================================
-- MATCHES TABLE (PvP Contests)
-- =====================================================

CREATE TABLE matches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Match configuration
    type                match_type NOT NULL,
    stake_amount        BIGINT NOT NULL CHECK (stake_amount > 0),
    rake_percentage     DECIMAL(5,2) DEFAULT 5.00,

    -- Participants
    creator_id          UUID NOT NULL REFERENCES users(id),
    opponent_id         UUID REFERENCES users(id),
    winner_id           UUID REFERENCES users(id),

    -- Slips
    creator_slip_id     UUID REFERENCES slips(id),
    opponent_slip_id    UUID REFERENCES slips(id),

    -- Scoring
    creator_points      DECIMAL(10,2) DEFAULT 0,
    opponent_points     DECIMAL(10,2) DEFAULT 0,

    -- Status & Settlement
    status              match_status DEFAULT 'pending',
    settled_at          TIMESTAMP WITH TIME ZONE,
    settlement_reason   VARCHAR(255),

    -- Prize distribution
    total_pot           BIGINT,                 -- stake_amount * 2
    rake_amount         BIGINT,                 -- total_pot * rake_percentage
    winner_payout       BIGINT,                 -- total_pot - rake_amount

    -- Invite link (for private matches)
    invite_code         VARCHAR(20) UNIQUE,
    invite_expires_at   TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at          TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT different_participants CHECK (creator_id != opponent_id)
);

CREATE INDEX idx_matches_creator_id ON matches(creator_id);
CREATE INDEX idx_matches_opponent_id ON matches(opponent_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_invite_code ON matches(invite_code);
CREATE INDEX idx_matches_created_at ON matches(created_at);


-- =====================================================
-- SLIPS TABLE (Prediction Collections)
-- =====================================================

CREATE TABLE slips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    match_id            UUID REFERENCES matches(id),

    -- Slip details
    name                VARCHAR(100),
    status              slip_status DEFAULT 'pending',

    -- Scoring
    total_picks         INTEGER DEFAULT 0,
    correct_picks       INTEGER DEFAULT 0,
    point_potential     DECIMAL(10,2) DEFAULT 0,  -- Calculated based on odds difficulty
    points_earned       DECIMAL(10,2) DEFAULT 0,

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    locked_at           TIMESTAMP WITH TIME ZONE,      -- When first game starts
    settled_at          TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_slips_user_id ON slips(user_id);
CREATE INDEX idx_slips_match_id ON slips(match_id);
CREATE INDEX idx_slips_status ON slips(status);


-- =====================================================
-- SLIP PICKS TABLE (Individual Predictions)
-- =====================================================

CREATE TABLE slip_picks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_id             UUID NOT NULL REFERENCES slips(id) ON DELETE CASCADE,
    sports_event_id     UUID NOT NULL REFERENCES sports_events(id),

    -- Pick details
    pick_type           pick_type NOT NULL,
    selection           VARCHAR(255) NOT NULL,  -- e.g., "home", "away", "over", "under", player name
    line                DECIMAL(10,2),          -- e.g., -3.5 spread, 220.5 total
    odds                INTEGER NOT NULL,       -- American odds: -110, +150, etc.

    -- For prop bets
    prop_type           VARCHAR(100),           -- e.g., "passing_yards", "touchdowns"
    prop_player_id      VARCHAR(100),
    prop_player_name    VARCHAR(100),

    -- Point value (calculated from odds)
    point_value         DECIMAL(10,2) NOT NULL,

    -- Result
    status              pick_status DEFAULT 'pending',
    result_value        DECIMAL(10,2),          -- Actual stat value for props

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at          TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_slip_picks_slip_id ON slip_picks(slip_id);
CREATE INDEX idx_slip_picks_sports_event_id ON slip_picks(sports_event_id);
CREATE INDEX idx_slip_picks_status ON slip_picks(status);


-- =====================================================
-- LEADERBOARDS TABLE
-- =====================================================

CREATE TABLE leaderboards (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Leaderboard config
    name                VARCHAR(100) NOT NULL,
    type                VARCHAR(50) NOT NULL,   -- 'global', 'weekly', 'monthly', 'friends'
    sport               sport_type,             -- NULL for all sports

    -- Time period
    period_start        TIMESTAMP WITH TIME ZONE,
    period_end          TIMESTAMP WITH TIME ZONE,

    -- Status
    is_active           BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- =====================================================
-- LEADERBOARD ENTRIES TABLE
-- =====================================================

CREATE TABLE leaderboard_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leaderboard_id      UUID NOT NULL REFERENCES leaderboards(id),
    user_id             UUID NOT NULL REFERENCES users(id),

    -- Stats
    rank                INTEGER NOT NULL,
    points              DECIMAL(10,2) DEFAULT 0,
    matches_won         INTEGER DEFAULT 0,
    matches_played      INTEGER DEFAULT 0,
    win_rate            DECIMAL(5,2) DEFAULT 0,
    current_streak      INTEGER DEFAULT 0,

    -- Timestamps
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(leaderboard_id, user_id)
);

CREATE INDEX idx_leaderboard_entries_leaderboard_id ON leaderboard_entries(leaderboard_id);
CREATE INDEX idx_leaderboard_entries_rank ON leaderboard_entries(rank);


-- =====================================================
-- FRIENDSHIPS TABLE
-- =====================================================

CREATE TABLE friendships (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    friend_id           UUID NOT NULL REFERENCES users(id),

    -- Status
    status              VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, blocked

    -- Timestamps
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at         TIMESTAMP WITH TIME ZONE,

    -- Constraints
    UNIQUE(user_id, friend_id),
    CONSTRAINT different_users CHECK (user_id != friend_id)
);

CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);


-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all relevant tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
    BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_slips_updated_at
    BEFORE UPDATE ON slips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sports_events_updated_at
    BEFORE UPDATE ON sports_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- WALLET TRANSACTION FUNCTION (Atomic Operations)
-- =====================================================

CREATE OR REPLACE FUNCTION process_wallet_transaction(
    p_user_id UUID,
    p_type transaction_type,
    p_amount BIGINT,
    p_description VARCHAR(500),
    p_match_id UUID DEFAULT NULL,
    p_idempotency_key VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_wallet_id UUID;
    v_balance_before BIGINT;
    v_balance_after BIGINT;
    v_transaction_id UUID;
    v_paid_amount BIGINT := 0;
    v_bonus_amount BIGINT := 0;
BEGIN
    -- Get wallet with lock
    SELECT id, total_balance INTO v_wallet_id, v_balance_before
    FROM wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_transaction_id
        FROM transactions
        WHERE idempotency_key = p_idempotency_key;

        IF v_transaction_id IS NOT NULL THEN
            RETURN v_transaction_id;  -- Return existing transaction
        END IF;
    END IF;

    -- Calculate new balance
    v_balance_after := v_balance_before + p_amount;

    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'Insufficient balance. Current: %, Required: %', v_balance_before, ABS(p_amount);
    END IF;

    -- For debits, use bonus first, then paid
    IF p_amount < 0 THEN
        v_bonus_amount := GREATEST(p_amount, -1 * (SELECT bonus_balance FROM wallets WHERE id = v_wallet_id));
        v_paid_amount := p_amount - v_bonus_amount;
    ELSE
        -- For credits, determine based on type
        IF p_type IN ('purchase') THEN
            v_paid_amount := p_amount;
        ELSE
            v_bonus_amount := p_amount;
        END IF;
    END IF;

    -- Update wallet
    UPDATE wallets
    SET paid_balance = paid_balance + v_paid_amount,
        bonus_balance = bonus_balance + v_bonus_amount,
        version = version + 1
    WHERE id = v_wallet_id;

    -- Create transaction record
    INSERT INTO transactions (
        wallet_id, user_id, type, status, amount,
        paid_amount, bonus_amount, balance_before, balance_after,
        match_id, description, idempotency_key, completed_at
    ) VALUES (
        v_wallet_id, p_user_id, p_type, 'completed', p_amount,
        v_paid_amount, v_bonus_amount, v_balance_before, v_balance_after,
        p_match_id, p_description, p_idempotency_key, NOW()
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;
```

---

## Monorepo Folder Structure

```
pick-rivals/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Continuous integration
│   │   ├── deploy-api.yml            # Backend deployment
│   │   └── deploy-mobile.yml         # EAS build triggers
│   └── PULL_REQUEST_TEMPLATE.md
│
├── apps/
│   ├── mobile/                       # React Native (Expo) App
│   │   ├── app/                      # Expo Router pages
│   │   │   ├── (auth)/               # Auth group (login, register, etc.)
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   ├── forgot-password.tsx
│   │   │   │   └── _layout.tsx
│   │   │   ├── (tabs)/               # Main tab navigation
│   │   │   │   ├── index.tsx         # Home / Feed
│   │   │   │   ├── matches.tsx       # Active matches
│   │   │   │   ├── create.tsx        # Slip builder
│   │   │   │   ├── leaderboard.tsx   # Rankings
│   │   │   │   ├── profile.tsx       # User profile
│   │   │   │   └── _layout.tsx
│   │   │   ├── match/
│   │   │   │   ├── [id].tsx          # Match detail / live view
│   │   │   │   └── join/[code].tsx   # Join via invite link
│   │   │   ├── slip/
│   │   │   │   ├── builder.tsx       # Full slip builder screen
│   │   │   │   └── [id].tsx          # Slip detail view
│   │   │   ├── wallet/
│   │   │   │   ├── index.tsx         # Wallet overview
│   │   │   │   └── purchase.tsx      # Token purchase
│   │   │   ├── settings/
│   │   │   │   ├── index.tsx
│   │   │   │   └── notifications.tsx
│   │   │   ├── _layout.tsx           # Root layout
│   │   │   └── +not-found.tsx
│   │   │
│   │   ├── src/
│   │   │   ├── components/           # Reusable UI components
│   │   │   │   ├── ui/               # Base UI primitives
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Card.tsx
│   │   │   │   │   ├── Input.tsx
│   │   │   │   │   ├── Modal.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── slip/             # Slip-related components
│   │   │   │   │   ├── SlipCard.tsx
│   │   │   │   │   ├── PickItem.tsx
│   │   │   │   │   ├── SlipBuilder.tsx
│   │   │   │   │   └── PointPotential.tsx
│   │   │   │   ├── match/            # Match-related components
│   │   │   │   │   ├── MatchCard.tsx
│   │   │   │   │   ├── LiveTracker.tsx
│   │   │   │   │   ├── VersusView.tsx
│   │   │   │   │   └── InviteModal.tsx
│   │   │   │   ├── events/           # Sports event components
│   │   │   │   │   ├── EventCard.tsx
│   │   │   │   │   ├── OddsButton.tsx
│   │   │   │   │   ├── PropSelector.tsx
│   │   │   │   │   └── SportFilter.tsx
│   │   │   │   └── wallet/           # Wallet components
│   │   │   │       ├── BalanceDisplay.tsx
│   │   │   │       ├── TokenPackCard.tsx
│   │   │   │       └── TransactionItem.tsx
│   │   │   │
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useWallet.ts
│   │   │   │   ├── useMatches.ts
│   │   │   │   ├── useSportsEvents.ts
│   │   │   │   ├── useSlipBuilder.ts
│   │   │   │   └── useSocket.ts
│   │   │   │
│   │   │   ├── stores/               # Zustand state stores
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── slipStore.ts
│   │   │   │   └── socketStore.ts
│   │   │   │
│   │   │   ├── services/             # API service layer
│   │   │   │   ├── api.ts            # Axios instance
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── wallet.service.ts
│   │   │   │   ├── match.service.ts
│   │   │   │   ├── events.service.ts
│   │   │   │   └── socket.service.ts
│   │   │   │
│   │   │   ├── utils/                # Utility functions
│   │   │   │   ├── odds.ts           # Odds conversion helpers
│   │   │   │   ├── formatting.ts     # Number/date formatting
│   │   │   │   ├── validation.ts
│   │   │   │   └── storage.ts        # Async storage helpers
│   │   │   │
│   │   │   ├── constants/
│   │   │   │   ├── sports.ts
│   │   │   │   ├── theme.ts
│   │   │   │   └── config.ts
│   │   │   │
│   │   │   └── types/                # TypeScript types (app-specific)
│   │   │       ├── navigation.ts
│   │   │       └── forms.ts
│   │   │
│   │   ├── assets/
│   │   │   ├── images/
│   │   │   ├── icons/
│   │   │   └── fonts/
│   │   │
│   │   ├── app.json                  # Expo config
│   │   ├── eas.json                  # EAS Build config
│   │   ├── babel.config.js
│   │   ├── tailwind.config.js
│   │   ├── metro.config.js
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                          # Node.js Backend
│       ├── src/
│       │   ├── index.ts              # Entry point
│       │   ├── app.ts                # Express app setup
│       │   ├── server.ts             # HTTP + WebSocket server
│       │   │
│       │   ├── config/
│       │   │   ├── index.ts          # Config aggregator
│       │   │   ├── database.ts       # DB connection config
│       │   │   ├── redis.ts          # Redis config
│       │   │   └── sports-api.ts     # SportRadar config
│       │   │
│       │   ├── routes/               # Express route definitions
│       │   │   ├── index.ts          # Route aggregator
│       │   │   ├── auth.routes.ts
│       │   │   ├── users.routes.ts
│       │   │   ├── wallet.routes.ts
│       │   │   ├── matches.routes.ts
│       │   │   ├── slips.routes.ts
│       │   │   ├── events.routes.ts
│       │   │   └── leaderboard.routes.ts
│       │   │
│       │   ├── controllers/          # Request handlers
│       │   │   ├── auth.controller.ts
│       │   │   ├── users.controller.ts
│       │   │   ├── wallet.controller.ts
│       │   │   ├── matches.controller.ts
│       │   │   ├── slips.controller.ts
│       │   │   ├── events.controller.ts
│       │   │   └── leaderboard.controller.ts
│       │   │
│       │   ├── services/             # Business logic
│       │   │   ├── auth.service.ts
│       │   │   ├── user.service.ts
│       │   │   ├── wallet.service.ts
│       │   │   ├── match.service.ts
│       │   │   ├── slip.service.ts
│       │   │   ├── settlement.service.ts
│       │   │   ├── matchmaking.service.ts
│       │   │   ├── sports-data.service.ts
│       │   │   └── notification.service.ts
│       │   │
│       │   ├── repositories/         # Data access layer
│       │   │   ├── user.repository.ts
│       │   │   ├── wallet.repository.ts
│       │   │   ├── match.repository.ts
│       │   │   ├── slip.repository.ts
│       │   │   └── event.repository.ts
│       │   │
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts
│       │   │   ├── validation.middleware.ts
│       │   │   ├── error.middleware.ts
│       │   │   ├── rate-limit.middleware.ts
│       │   │   └── geofence.middleware.ts
│       │   │
│       │   ├── socket/               # WebSocket handlers
│       │   │   ├── index.ts
│       │   │   ├── match.socket.ts
│       │   │   └── events.socket.ts
│       │   │
│       │   ├── jobs/                 # Background job processors
│       │   │   ├── index.ts
│       │   │   ├── settlement.job.ts
│       │   │   ├── odds-sync.job.ts
│       │   │   ├── weekly-allowance.job.ts
│       │   │   └── leaderboard-update.job.ts
│       │   │
│       │   ├── validators/           # Zod schemas
│       │   │   ├── auth.validator.ts
│       │   │   ├── slip.validator.ts
│       │   │   ├── match.validator.ts
│       │   │   └── wallet.validator.ts
│       │   │
│       │   └── utils/
│       │       ├── logger.ts
│       │       ├── errors.ts         # Custom error classes
│       │       ├── odds.ts           # Odds calculations
│       │       └── points.ts         # Point potential calculations
│       │
│       ├── prisma/
│       │   ├── schema.prisma         # Prisma schema
│       │   ├── migrations/           # Database migrations
│       │   └── seed.ts               # Seed data
│       │
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── fixtures/
│       │
│       ├── Dockerfile
│       ├── tsconfig.json
│       └── package.json
│
├── packages/                         # Shared packages
│   ├── shared-types/                 # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── user.types.ts
│   │   │   ├── wallet.types.ts
│   │   │   ├── match.types.ts
│   │   │   ├── slip.types.ts
│   │   │   ├── event.types.ts
│   │   │   └── api.types.ts          # API request/response types
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── utils/                        # Shared utility functions
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── odds.ts               # Odds conversion
│   │   │   ├── points.ts             # Point calculations
│   │   │   └── validation.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── eslint-config/                # Shared ESLint config
│       ├── index.js
│       └── package.json
│
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md               # This file
│   ├── PHASE_1_PLAN.md              # MVP implementation plan
│   ├── API.md                        # API documentation
│   ├── DEPLOYMENT.md                 # Deployment guide
│   └── COMPLIANCE.md                 # Legal compliance notes
│
├── scripts/                          # Development scripts
│   ├── setup.sh                      # Initial setup
│   ├── seed-db.ts                    # Database seeding
│   └── generate-types.ts             # Type generation
│
├── .env.example                      # Environment variables template
├── .gitignore
├── .eslintrc.js
├── .prettierrc
├── package.json                      # Root package.json (workspaces)
├── pnpm-workspace.yaml              # pnpm workspace config
├── turbo.json                        # Turborepo config
└── README.md
```

---

## API Design

### REST API Endpoints (v1)

#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login with email/password |
| POST | `/api/v1/auth/logout` | Logout (invalidate token) |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password with token |
| POST | `/api/v1/auth/verify-email` | Verify email address |

#### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/me` | Get current user profile |
| PATCH | `/api/v1/users/me` | Update current user profile |
| GET | `/api/v1/users/:id` | Get user public profile |
| GET | `/api/v1/users/:id/stats` | Get user statistics |
| GET | `/api/v1/users/search` | Search users by username |

#### Wallet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/wallet` | Get wallet balance |
| GET | `/api/v1/wallet/transactions` | Get transaction history |
| POST | `/api/v1/wallet/purchase` | Initiate IAP (returns client secret) |
| POST | `/api/v1/wallet/verify-purchase` | Verify IAP receipt |

#### Sports Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/events` | Get upcoming events (with filters) |
| GET | `/api/v1/events/:id` | Get event details with odds |
| GET | `/api/v1/events/:id/props` | Get player props for event |

#### Slips
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/slips` | Create new slip |
| GET | `/api/v1/slips` | Get user's slips |
| GET | `/api/v1/slips/:id` | Get slip details |
| PATCH | `/api/v1/slips/:id` | Update slip (add/remove picks) |
| DELETE | `/api/v1/slips/:id` | Delete draft slip |

#### Matches
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/matches` | Create match (challenge) |
| GET | `/api/v1/matches` | Get user's matches |
| GET | `/api/v1/matches/:id` | Get match details |
| POST | `/api/v1/matches/:id/join` | Join match (with slip) |
| GET | `/api/v1/matches/invite/:code` | Get match by invite code |

#### Leaderboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/leaderboard` | Get global leaderboard |
| GET | `/api/v1/leaderboard/friends` | Get friends leaderboard |
| GET | `/api/v1/leaderboard/weekly` | Get weekly leaderboard |

### WebSocket Events

#### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join:match` | `{ matchId }` | Join match room for live updates |
| `leave:match` | `{ matchId }` | Leave match room |
| `subscribe:events` | `{ eventIds[] }` | Subscribe to live event updates |

#### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `match:updated` | `{ match }` | Match state changed |
| `match:settled` | `{ match, result }` | Match has been settled |
| `event:score` | `{ eventId, scores }` | Live score update |
| `event:status` | `{ eventId, status }` | Event status change |
| `slip:pick:settled` | `{ slipId, pickId, result }` | Individual pick settled |

---

## Security & Compliance

### Authentication & Authorization
- **JWT-based authentication** with short-lived access tokens (15min) and refresh tokens (7 days)
- **Refresh token rotation** - new refresh token issued on each refresh
- **Password requirements**: Minimum 8 characters, mixed case, numbers
- **Rate limiting**: 100 requests/minute per IP, 1000/minute per authenticated user

### Data Security
- **Encryption at rest**: PostgreSQL with encrypted storage
- **Encryption in transit**: TLS 1.3 for all API communications
- **PII handling**: Email and KYC data encrypted with application-level encryption
- **Secrets management**: Environment variables via cloud provider secrets manager

### Compliance (Skill-Based Gaming)
- **Geofencing**: Block restricted states (WA, MT, ID, NV - verify current legislation)
- **Age verification**: 18+ (19/21+ where required) via KYC provider
- **Alternative Method of Entry**: Weekly free tokens (1,000 RC) ensure non-purchase path
- **Separate coin buckets**: Track paid vs bonus coins for compliance audits
- **No house edge**: Platform is matchmaker, not bookmaker
- **Audit trail**: Immutable transaction ledger with full history

### Anti-Fraud Measures
- **Collusion detection**: Monitor user-to-user match frequency and patterns
- **Velocity limits**: Max matches against same opponent per 24h
- **Device fingerprinting**: Detect multi-accounting
- **IAP receipt validation**: Server-side verification with Apple/Google

---

## Third-Party Integrations

### Sports Data
| Provider | Purpose | Priority |
|----------|---------|----------|
| **SportRadar** | Odds, scores, player props | Primary |
| **OddsAPI** | Backup odds source | Secondary |

### Payment / IAP
| Provider | Purpose |
|----------|---------|
| **Apple StoreKit 2** | iOS in-app purchases |
| **Google Play Billing** | Android in-app purchases |

### Identity / KYC
| Provider | Purpose |
|----------|---------|
| **Veriff** or **Jumio** | Identity verification, age check |

### Push Notifications
| Provider | Purpose |
|----------|---------|
| **Firebase Cloud Messaging** | Cross-platform push notifications |
| **Apple Push Notification Service** | iOS push (via FCM) |

### Analytics & Monitoring
| Provider | Purpose |
|----------|---------|
| **Mixpanel** or **Amplitude** | Product analytics |
| **Sentry** | Error tracking |
| **Datadog** | Infrastructure monitoring |

---

## Next Steps

1. Review and approve this architecture document
2. Review PHASE_1_PLAN.md for MVP implementation tasks
3. Set up monorepo structure and development environment
4. Begin Phase 1 implementation

---

*Document Version: 1.0*
*Last Updated: December 2024*
