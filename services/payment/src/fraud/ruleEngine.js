const pool = require('../db/pool');

// Each rule returns { signal, weight, detail } or null if not triggered
async function checkVelocity({ merchant_id, customer_ip, customer_email }) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM payments
     WHERE customer_ip = $1 AND created_at > now() - interval '10 minutes'`,
    [customer_ip]
  );
  const count = parseInt(result.rows[0].count, 10);
  if (count >= 5) {
    return { signal: 'velocity_ip', weight: 35, detail: { count, window: '10m' } };
  }
  if (count >= 3) {
    return { signal: 'velocity_ip_moderate', weight: 15, detail: { count, window: '10m' } };
  }
  return null;
}

async function checkMultipleCardsPerDevice({ device_fingerprint }) {
  if (!device_fingerprint) return { signal: 'no_device_fingerprint', weight: 10, detail: {} };
  const result = await pool.query(
    `SELECT COUNT(DISTINCT customer_email) FROM payments
     WHERE device_fingerprint = $1 AND created_at > now() - interval '24 hours'`,
    [device_fingerprint]
  );
  const count = parseInt(result.rows[0].count, 10);
  if (count >= 4) {
    return { signal: 'multi_account_device', weight: 30, detail: { distinct_emails: count } };
  }
  return null;
}

function checkDisposableEmail({ customer_email }) {
  const disposableDomains = ['mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com'];
  const domain = customer_email?.split('@')[1]?.toLowerCase();
  if (domain && disposableDomains.includes(domain)) {
    return { signal: 'disposable_email', weight: 25, detail: { domain } };
  }
  return null;
}

// Stub for now — Phase 2 wires this to a real IP reputation API/db
function checkIpReputation({ customer_ip }) {
  const knownBadIpsStub = []; // populate later from threat intel feed
  if (knownBadIpsStub.includes(customer_ip)) {
    return { signal: 'known_bad_ip', weight: 50, detail: { ip: customer_ip } };
  }
  return null;
}

async function evaluate(context) {
  const checks = await Promise.all([
    checkVelocity(context),
    checkMultipleCardsPerDevice(context),
    checkDisposableEmail(context),
    checkIpReputation(context)
  ]);

  const triggered = checks.filter(Boolean);
  const rawScore = triggered.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.min(rawScore, 100);

  let decision;
  if (score < 20) decision = 'approve';
  else if (score < 60) decision = 'otp';
  else if (score < 80) decision = 'review';
  else decision = 'reject';

  return { score, decision, triggered };
}

module.exports = { evaluate };