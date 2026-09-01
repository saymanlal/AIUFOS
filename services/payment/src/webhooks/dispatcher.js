const crypto = require('crypto');
const pool = require('../db/pool');

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000]; // 1s, 5s, 15s backoff

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

async function deliverOnce(webhook, event, payload, attempt) {
  const signature = sign(payload, webhook.secret);
  let responseCode = null;
  let responseBody = null;
  let success = false;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AIUFOS-Event': event,
        'X-AIUFOS-Signature': signature
      },
      body: JSON.stringify(payload)
    });
    responseCode = res.status;
    responseBody = (await res.text()).slice(0, 500);
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    responseBody = String(err.message).slice(0, 500);
  }

  await pool.query(
    `INSERT INTO webhook_deliveries (webhook_id, event, payload, status, attempt, response_code, response_body, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $4 = 'success' THEN now() ELSE NULL END)`,
    [webhook.id, event, payload, success ? 'success' : 'failed', attempt, responseCode, responseBody]
  );

  return success;
}

async function deliverWithRetry(webhook, event, payload, attempt) {
  const success = await deliverOnce(webhook, event, payload, attempt);
  if (!success && attempt < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS_MS[attempt - 1] || 15000;
    setTimeout(() => deliverWithRetry(webhook, event, payload, attempt + 1), delay);
  }
}

async function dispatchEvent(merchantId, event, payload) {
  const result = await pool.query(
    `SELECT * FROM webhooks WHERE merchant_id = $1 AND $2 = ANY(events)`,
    [merchantId, event]
  );
  for (const webhook of result.rows) {
    deliverWithRetry(webhook, event, payload, 1); // fire and forget
  }
}

module.exports = { dispatchEvent };
