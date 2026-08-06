const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const ruleEngine = require('../fraud/ruleEngine');

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { order_id, method, customer_email, customer_phone, device_fingerprint } = req.body;
  const customer_ip = req.ip;

  const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [order_id]);
  const order = orderResult.rows[0];
  if (!order) return res.status(404).json({ error: 'order_not_found' });

  const riskContext = {
    merchant_id: req.merchant.merchant_id,
    customer_ip,
    customer_email,
    device_fingerprint
  };
  const { score, decision, triggered } = await ruleEngine.evaluate(riskContext);

  const paymentResult = await pool.query(
    `INSERT INTO payments
     (order_id, merchant_id, amount, method, customer_email, customer_phone, customer_ip, device_fingerprint, risk_score, risk_decision, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      order_id, req.merchant.merchant_id, order.amount, method,
      customer_email, customer_phone, customer_ip, device_fingerprint,
      score, decision,
      decision === 'reject' ? 'failed' : 'pending'
    ]
  );

  const payment = paymentResult.rows[0];

  for (const t of triggered) {
    await pool.query(
      `INSERT INTO risk_events (payment_id, signal, weight, detail) VALUES ($1,$2,$3,$4)`,
      [payment.id, t.signal, t.weight, t.detail]
    );
  }

  res.status(201).json({
    payment_id: payment.id,
    status: payment.status,
    risk_score: score,
    risk_decision: decision,
    triggered_signals: triggered.map(t => t.signal)
  });
});

module.exports = router;