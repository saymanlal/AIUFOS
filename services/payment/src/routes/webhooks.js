const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).optional()
});

router.post('/', authMiddleware, async (req, res) => {
  const parsed = createWebhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { url, events } = parsed.data;
  const secret = crypto.randomBytes(24).toString('hex');

  const result = await pool.query(
    `INSERT INTO webhooks (merchant_id, url, secret, events)
     VALUES ($1, $2, $3, $4) RETURNING id, url, events, created_at`,
    [req.merchant.merchant_id, url, secret, events || ['payment.created', 'payment.failed', 'payment.risk_flagged']]
  );

  // secret is shown only once, at creation — merchant must store it
  res.status(201).json({ ...result.rows[0], secret });
});

router.get('/', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT id, url, events, created_at FROM webhooks WHERE merchant_id = $1`,
    [req.merchant.merchant_id]
  );
  res.json(result.rows);
});

module.exports = router;
