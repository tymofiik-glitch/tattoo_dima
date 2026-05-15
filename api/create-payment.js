const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, leadId } = req.body || {};

  if (!email) return res.status(400).json({ error: 'Missing email' });

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY;
  if (!MOLLIE_KEY) return res.status(500).json({ error: 'Mollie API key not configured' });

  const orderId = crypto.randomBytes(8).toString('hex');
  const host = req.headers.host;

  try {
    const response = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MOLLIE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: '50.00' },
        description: `Tattoo Deposit — ${name || 'Client'}`,
        redirectUrl: `https://${host}/deposit?status=success&name=${encodeURIComponent(name || '')}`,
        webhookUrl: `https://${host}/api/payment-webhook`,
        metadata: { name, email, leadId: leadId || '', orderId }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Mollie error:', data);
      throw new Error(data.detail || 'Failed to create payment');
    }

    return res.status(200).json({ checkoutUrl: data._links.checkout.href });
  } catch (err) {
    console.error('Payment creation error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
