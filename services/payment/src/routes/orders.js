const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const createOrderSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().default('INR'),
  receipt: z.string().optional(),
  notes: z.record(z.any()).optional()
});

router.post('/', authMiddleware, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { amount, currency, receipt, notes } = parsed.data;
  const result = await pool.query(
    `INSERT INTO orders (merchant_id, amount, currency, receipt, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.merchant.merchant_id, amount, currency, receipt, notes || {}]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;