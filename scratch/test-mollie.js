
const https = require('https');

const data = JSON.stringify({
  amount: {
    currency: 'EUR',
    value: '50.00',
  },
  description: 'Test Tattoo Deposit',
  redirectUrl: 'https://example.com/success',
  webhookUrl: 'https://example.com/webhook',
});

const options = {
  hostname: 'api.mollie.com',
  port: 443,
  path: '/v2/payments',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test_3pwW2eqsqJemN4HdNNyKAsH9BHe3R5',
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
};

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', (d) => {
    responseData += d;
  });

  res.on('end', () => {
    console.log('--- MOLLIE TEST RESULT ---');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const parsed = JSON.parse(responseData);
      console.log('SUCCESS! Checkout URL:', parsed._links.checkout.href);
    } else {
      console.log('FAILED Status:', res.statusCode);
      console.log('Response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('ERROR:', error);
});

req.write(data);
req.end();
