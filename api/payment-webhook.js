const { sendDepositConfirmation } = require('./utils/email');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Mollie sends the payment ID in the body as 'id'
  const { id } = req.body;

  if (!id) {
    return res.status(400).send('Missing payment ID');
  }

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY;

  try {
    // 1. Fetch the payment status from Mollie
    const response = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: {
        'Authorization': `Bearer ${MOLLIE_KEY}`,
      },
    });

    const payment = await response.json();

    if (payment.status === 'paid') {
      const { name, email, leadId, orderId } = payment.metadata;
      console.log('Payment SUCCESS:', id, payment.metadata);
      
      // 1. Update Airtable Status
      if (leadId) {
        try {
          await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME}/${leadId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                "Status": "Deposit Paid",
                "Mollie Payment ID": id,
                "Payment Date": new Date().toISOString()
              }
            })
          });
          console.log('Airtable updated for lead:', leadId);
        } catch (err) {
          console.error('Airtable update failed:', err);
        }
      }

      // 2. Notify via Telegram
      const message = `💰 *Deposit Received!* \n\n` +
                      `👤 *Client:* ${name || 'Unknown'}\n` +
                      `📧 *Email:* ${email || 'N/A'}\n` +
                      `💶 *Amount:* ${payment.amount.value} ${payment.amount.currency}\n` +
                      `🆔 *Order:* ${orderId || id}\n\n` +
                      `✅ Status updated in Airtable.`;

      try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          })
        });
        console.log('Telegram notification sent');
      } catch (err) {
        console.error('Telegram notification failed:', err);
      }

      if (email) {
        sendDepositConfirmation({ name: name || 'there', email }).catch(err =>
          console.error('Email #3a failed:', err.message)
        );
      }

    } else {
      console.log('Payment status updated:', payment.status);
    }

    // Always respond with 200 OK to Mollie
    res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
}
