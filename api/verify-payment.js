const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || !id.startsWith('tr_')) return res.status(400).json({ error: 'Invalid payment id' });

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY || 'test_3pwW2eqsqJemN4HdNNyKAsH9BHe3R5';

  try {
    const r = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_KEY}` }
    });
    const data = await r.json();
    return res.status(200).json({ status: data.status || 'unknown' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
