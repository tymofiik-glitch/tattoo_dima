const { setCorsHeaders, setSecurityHeaders } = require('./utils/security');

const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const times = (rateMap.get(ip) || []).filter(t => now - t < 60000);
  if (times.length >= 20) return false;
  times.push(now);
  rateMap.set(ip, times);
  return true;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res, req.headers.origin);
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRate(ip)) return res.status(429).json({ error: 'Too many requests' });

  const { id } = req.query;
  if (!id || !/^tr_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'Invalid payment id' });

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY;

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
