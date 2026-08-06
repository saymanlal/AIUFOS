CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    pan TEXT,
    gst TEXT,
    status TEXT DEFAULT 'pending',       -- pending, approved, suspended
    risk_tier TEXT DEFAULT 'standard',   -- standard, watch, high_risk
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    key_id TEXT UNIQUE NOT NULL,
    key_secret_hash TEXT NOT NULL,
    mode TEXT DEFAULT 'test',            -- test, live
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked BOOLEAN DEFAULT false
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id),
    amount BIGINT NOT NULL,              -- in paise
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'created',       -- created, attempted, paid, failed
    receipt TEXT,
    notes JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    merchant_id UUID REFERENCES merchants(id),
    amount BIGINT NOT NULL,
    method TEXT,                         -- upi, card, netbanking, wallet
    status TEXT DEFAULT 'pending',       -- pending, authorized, captured, failed, refunded
    customer_email TEXT,
    customer_phone TEXT,
    customer_ip TEXT,
    device_fingerprint TEXT,
    risk_score INT,
    risk_decision TEXT,                  -- approve, otp, review, reject
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id),
    amount BIGINT NOT NULL,
    status TEXT DEFAULT 'processed',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE risk_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id),
    signal TEXT NOT NULL,                -- e.g. 'velocity', 'vpn_detected', 'disposable_email'
    weight INT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id),
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT[] DEFAULT ARRAY['payment.captured','payment.failed'],
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_merchant ON payments(merchant_id);
CREATE INDEX idx_payments_ip ON payments(customer_ip);
CREATE INDEX idx_payments_device ON payments(device_fingerprint);
CREATE INDEX idx_orders_merchant ON orders(merchant_id);