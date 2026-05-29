const crypto = require('crypto');
const { setCorsHeaders, setSecurityHeaders } = require('./utils/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req.headers.origin);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, leadId, groupSize } = req.body || {};
  const people = Math.min(6, Math.max(1, parseInt(groupSize) || 1));
  const depositAmount = (50 * people).toFixed(2);

  const clientEmail = email || 'guest@kaktuz.ink';

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY;
  
  const orderId = crypto.randomBytes(8).toString('hex');
  const domain = 'kaktuz.ink';

  try {
    const response = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MOLLIE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: depositAmount },
        description: `Tattoo Deposit${people > 1 ? ` (${people} people)` : ''} — ${name || 'Client'}`,
        redirectUrl: `https://${domain}/deposit?status=success&name=${encodeURIComponent(name || '')}`,
        webhookUrl: `https://${domain}/api/payment-webhook`,
        metadata: { name, email: clientEmail, leadId: leadId || '', orderId, groupSize: people }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Mollie error:', data);
      throw new Error(data.detail || 'Failed to create payment');
    }

    return res.status(200).json({ checkoutUrl: data._links.checkout.href, paymentId: data.id });
  } catch (err) {
    console.error('Payment creation error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
