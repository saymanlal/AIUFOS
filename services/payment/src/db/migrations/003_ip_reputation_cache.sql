CREATE TABLE IF NOT EXISTS ip_reputation_cache (
    ip TEXT PRIMARY KEY,
    abuse_score INT NOT NULL,
    is_vpn_or_proxy BOOLEAN DEFAULT false,
    country_code TEXT,
    isp TEXT,
    raw_response JSONB,
    checked_at TIMESTAMPTZ DEFAULT now()
);
