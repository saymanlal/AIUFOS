const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.argv[2];

app.post('/receive', (req, res) => {
  const signature = req.headers['x-aiufos-signature'];
  const event = req.headers['x-aiufos-event'];

  if (WEBHOOK_SECRET) {
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    console.log(`Signature valid: ${expected === signature}`);
  }

  console.log(`Event: ${event}`);
  console.log('Payload:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ received: true });
});

app.listen(5000, () => console.log('Webhook receiver listening on :5000/receive'));
