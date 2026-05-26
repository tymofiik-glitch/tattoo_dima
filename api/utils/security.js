const ALLOWED_ORIGIN = 'https://kaktuz.ink';

function setCorsHeaders(res, origin) {
  const allowed = !origin || origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : null;
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

module.exports = { setCorsHeaders, setSecurityHeaders };
