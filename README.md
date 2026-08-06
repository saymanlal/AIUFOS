# AIUFOS — AI Unified Financial OS

AI-powered payment gateway and fraud intelligence platform. Built as a B2B payment layer with an integrated rule-based (soon AI-based) fraud/risk engine — positioned as a security-first alternative to standard payment gateways.

> Phase 1 status: Auth, Orders, Payments, and Rule Engine v0 are live and tested locally.

## Vision

Most payment gateways only tell you "Payment Successful." AIUFOS evaluates every transaction against dozens of risk signals before approving it — velocity checks, device fingerprinting, disposable email detection, IP reputation — and produces a transparent risk score (0–100) with an explainable decision (`approve`, `otp`, `review`, `reject`).

## Architecture

```
aiufos/
├── apps/
│   ├── dashboard/     # Merchant dashboard (Next.js) — Phase 2
│   ├── checkout/      # Customer checkout UI — Phase 2
│   ├── admin/         # Admin panel — Phase 2+
│   └── docs/          # Developer docs — later
├── services/
│   ├── payment/       # Core API: auth, orders, payments, rule engine (LIVE)
│   ├── auth/          # Standalone auth service — future extraction
│   ├── settlement/    # Settlement engine — Phase 3
│   ├── refund/        # Refund engine — Phase 3
│   ├── webhook/       # Webhook delivery worker — Phase 2
│   ├── merchant/       # Merchant management — future extraction
│   ├── fraud/          # Standalone fraud/ML service — Phase 3+
│   └── notification/   # Email/SMS notifications — later
├── packages/
│   ├── sdk-node/
│   ├── sdk-python/
│   └── sdk-java/
└── infra/
    ├── docker/
    └── kubernetes/
```

## Tech Stack

- **Backend:** Node.js (Express)
- **Database:** PostgreSQL
- **Cache/Queue:** Redis (wired in later phases)
- **Auth:** JWT
- **Validation:** Zod
- **Security middleware:** Helmet, CORS, express-rate-limit

## Prerequisites

- Node.js ≥ 20.6 (native `--env-file` support; project developed on v24)
- PostgreSQL (any cluster version 16+)
- npm

## Setup

### 1. Clone and install

```bash
cd services/payment
npm install
```

### 2. Configure PostgreSQL

Check which cluster/port is active:

```bash
pg_lsclusters
```

Create the database user and database (adjust `-p <port>` to match your active cluster):

```bash
sudo -u postgres psql -p <port> -c "CREATE USER krushn WITH PASSWORD 'your_password' SUPERUSER;"
sudo -u postgres psql -p <port> -c "CREATE DATABASE aiufos_dev OWNER krushn;"
```

### 3. Environment variables

Create `services/payment/.env`:

```
PORT=4000
DATABASE_URL=postgresql://krushn:your_password@localhost:<port>/aiufos_dev
JWT_SECRET=change_this_to_a_long_random_string_later
NODE_ENV=development
```

Verify it loads correctly:

```bash
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
```

### 4. Run migrations

```bash
node src/db/migrate.js
```

Expected output: `Migration complete.`

### 5. Start the server

```bash
npm run dev
```

Server runs at `http://localhost:4000`. Health check:

```bash
curl http://localhost:4000/health
```

## Database Schema

| Table | Purpose |
|---|---|
| `merchants` | Business accounts, KYC status, risk tier |
| `api_keys` | Merchant API credentials (test/live mode) |
| `orders` | Payment intents created by merchants |
| `payments` | Actual payment attempts, linked to risk score/decision |
| `refunds` | Refund records against payments |
| `risk_events` | Every fraud signal triggered per payment, with weight |
| `webhooks` | Merchant webhook endpoints and subscribed events |

## API Reference

Base URL: `http://localhost:4000/v1`

### Auth

**POST `/auth/signup`**
```json
{ "business_name": "Test Merchant", "email": "test@aiufos.dev", "password": "password123" }
```

**POST `/auth/login`**
```json
{ "email": "test@aiufos.dev", "password": "password123" }
```
Returns a JWT `token`, valid 24h. Pass as `Authorization: Bearer <token>` on all subsequent requests.

### Orders

**POST `/orders`** *(auth required)*
```json
{ "amount": 50000, "currency": "INR", "receipt": "order_001" }
```
Amount is in paise (smallest currency unit).

### Payments

**POST `/payments`** *(auth required)*
```json
{ "order_id": "<order_id>", "method": "upi", "customer_email": "cust@test.com", "device_fingerprint": "abc123" }
```
Runs the rule engine before returning. Response includes `risk_score`, `risk_decision`, and `triggered_signals`.

## Rule Engine v0

No ML yet — pure weighted rules. Current checks:

| Signal | Weight | Trigger |
|---|---|---|
| `velocity_ip` | 35 | ≥5 payments from same IP in 10 min |
| `velocity_ip_moderate` | 15 | ≥3 payments from same IP in 10 min |
| `multi_account_device` | 30 | ≥4 distinct emails from same device in 24h |
| `no_device_fingerprint` | 10 | Missing device fingerprint |
| `disposable_email` | 25 | Email domain in disposable-email list |
| `known_bad_ip` | 50 | IP in threat intel list (stub — populated in Phase 2) |

**Decision thresholds:**
- Score `< 20` → `approve`
- Score `20–59` → `otp`
- Score `60–79` → `review`
- Score `≥ 80` → `reject`

## Quick End-to-End Test

```bash
# Signup
curl -s -X POST http://localhost:4000/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"business_name":"Test Merchant","email":"test2@aiufos.dev","password":"password123"}'

# Login and capture token
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test2@aiufos.dev","password":"password123"}' | grep -oP '"token":"[^"]+' | cut -d'"' -f4)

# Create order and capture ID
ORDER_ID=$(curl -s -X POST http://localhost:4000/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount":50000,"currency":"INR","receipt":"order_001"}' | grep -oP '"id":"[^"]+' | head -1 | cut -d'"' -f4)

# Create payment (triggers rule engine)
curl -s -X POST http://localhost:4000/v1/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"order_id\":\"$ORDER_ID\",\"method\":\"upi\",\"customer_email\":\"cust@test.com\",\"device_fingerprint\":\"abc123\"}"
```

## Roadmap

- [x] **Phase 1:** Repo scaffold, DB schema, auth, orders/payments API, rule engine v0
- [ ] **Phase 2:** Next.js merchant dashboard, real IP reputation lookup, webhook delivery worker, device fingerprinting on frontend
- [ ] **Phase 3:** Settlement engine, refund engine, ML-based fraud scoring (once transaction data is collected)
- [ ] **Phase 4:** Merchant mobile app, enterprise APIs, threat intelligence feed
- [ ] **Phase 5:** Compliance hardening (PCI DSS, RBI aggregator authorization evaluation)

## Regulatory Note

This platform currently integrates with (or is designed to integrate with) a licensed payment aggregator rather than processing payments directly. Direct payment processing in India requires RBI Payment Aggregator authorization. See project blueprint for the full compliance roadmap.

## License

Proprietary — Cybokrafts Unniversal Innovations Pvt. Ltd.