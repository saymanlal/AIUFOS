const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db/pool');

const router = express.Router();

const signupSchema = z.object({
  business_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { business_name, email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO merchants (business_name, email, password_hash)
       VALUES ($1, $2, $3) RETURNING id, business_name, email, status`,
      [business_name, email, hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email_already_exists' });
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM merchants WHERE email = $1', [email]);
  const merchant = result.rows[0];
  if (!merchant) return res.status(401).json({ error: 'invalid_credentials' });

  const valid = await bcrypt.compare(password, merchant.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });

  const token = jwt.sign(
    { merchant_id: merchant.id, email: merchant.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, merchant: { id: merchant.id, business_name: merchant.business_name, status: merchant.status } });
});

module.exports = router;