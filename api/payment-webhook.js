const { sendDepositConfirmation } = require('./utils/email');
const { appendTimelineAndEdit } = require('./utils/telegram');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body;
  if (!id) return res.status(400).send('Missing payment ID');

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY || 'test_3pwW2eqsqJemN4HdNNyKAsH9BHe3R5';

  try {
    const response = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_KEY}` }
    });
    const payment = await response.json();

    if (payment.status !== 'paid') {
      console.log('Payment status updated:', payment.status);
      return res.status(200).send('OK');
    }

    const { name, email, leadId, orderId } = payment.metadata;
    console.log('Payment SUCCESS:', id, payment.metadata);

    // 1. Update Airtable status + payment metadata.
    if (leadId) {
      try {
        await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/CRM_Leads/${leadId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              "Status": "💳 Deposit Paid",
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

    // 2. Fetch lead and re-render the Telegram card via the shared helper.
    let telegramMessageId = null;
    if (leadId) {
      try {
        const airtableRes = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/CRM_Leads/${leadId}`, {
          headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` }
        });
        if (airtableRes.ok) {
          const airtableData = await airtableRes.json();
          telegramMessageId = airtableData.fields?.['Telegram Message ID'];

          const phone = airtableData.fields?.Phone || '';
          const igRaw = (airtableData.fields?.Instagram || '').replace('@', '');
          const wa = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
          const ig = igRaw ? `https://instagram.com/${igRaw}` : null;

          const replyMarkup = {
            inline_keyboard: [
              [
                { text: '📱 WhatsApp', url: wa },
                ...(ig ? [{ text: '📸 Instagram', url: ig }] : [])
              ],
              [{ text: '📅 Назначить дату', callback_data: 'set_date' }],
              [{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]
            ]
          };

          const today = new Date().toISOString().split('T')[0];
          await appendTimelineAndEdit(
            airtableData,
            `💳 Deposit paid · ${today}`,
            { status: 'deposit_paid', replyMarkup }
          );
        } else {
          console.error('Failed to fetch Airtable lead. Status:', airtableRes.status);
        }
      } catch (err) {
        console.error('Failed to refresh Telegram main message:', err.message);
      }
    }

    // 3. Reply notification in thread (kept separate so Alena sees an
    //    explicit "new payment arrived" ping, not just a silent card edit).
    const message = `💰 *Deposit Received!* \n\n` +
                    `👤 *Client:* ${name || 'Unknown'}\n` +
                    `📧 *Email:* ${email || 'N/A'}\n` +
                    `💶 *Amount:* ${payment.amount.value} ${payment.amount.currency}\n` +
                    `🆔 *Order:* ${orderId || id}\n\n` +
                    `✅ Все процессы успешно выполнены!`;

    try {
      const sendPayload = {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      };
      if (telegramMessageId) {
        sendPayload.reply_to_message_id = parseInt(telegramMessageId, 10);
      }
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendPayload)
      });
      console.log('Telegram notification sent');
    } catch (err) {
      console.error('Telegram notification failed:', err);
    }

    if (email) {
      try {
        await sendDepositConfirmation({ name: name || 'there', email });
        console.log('Deposit confirmation email sent successfully');
      } catch (err) {
        console.error('Email #3a failed:', err.message);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};
