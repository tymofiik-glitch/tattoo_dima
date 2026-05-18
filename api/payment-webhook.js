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

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY || 'test_3pwW2eqsqJemN4HdNNyKAsH9BHe3R5';

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

      // 2. Fetch lead details from Airtable to edit the main message
      let telegramMessageId = null;
      let recordFields = null;

      if (leadId) {
        try {
          const airtableRes = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/CRM_Leads/${leadId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`
            }
          });
          if (airtableRes.ok) {
            const airtableData = await airtableRes.json();
            recordFields = airtableData.fields;
            telegramMessageId = recordFields?.['Telegram Message ID'];
            console.log('Successfully fetched Airtable lead. Telegram Message ID:', telegramMessageId);
          } else {
            console.error('Failed to fetch Airtable lead. Status:', airtableRes.status);
          }
        } catch (err) {
          console.error('Airtable lead fetch failed:', err.message);
        }
      }

      // 3. Edit the main message if Telegram Message ID exists
      if (telegramMessageId && recordFields) {
        try {
          const updatedHeader = '💳 *ДЕПОЗИТ ОПЛАЧЕН*';
          const updatedText = `
${updatedHeader}
━━━━━━━━━━━━━━━━━━
👤 *CLIENT:* ${recordFields.Name || 'Unknown'}
📧 *EMAIL:* ${recordFields.Email || 'N/A'}
📸 *IG:* ${recordFields.Instagram || 'N/A'}
📞 *PHONE:* ${recordFields.Phone || 'N/A'}

🖼️ *TATTOO DETAILS*
📐 *SIZE:* ${recordFields.Size || 'N/A'}
📍 *PLACE:* ${recordFields.Placement || 'N/A'}
💰 *BUDGET:* ${recordFields.Budget || 'N/A'}

📝 *IDEA:*
${recordFields.Idea || 'N/A'}

📓 *NOTES:*
${recordFields.Notes || 'None'}
━━━━━━━━━━━━━━━━━━`.trim();

          const wa = `https://wa.me/${(recordFields.Phone || '').replace(/[^0-9]/g, '')}`;
          const igRaw = (recordFields.Instagram || '').replace('@', '');
          const ig = igRaw ? `https://instagram.com/${igRaw}` : null;

          const updatedKeyboard = {
            inline_keyboard: [
              [
                { text: '📱 WhatsApp', url: wa },
                ...(ig ? [{ text: '📸 Instagram', url: ig }] : [])
              ],
              [{ text: '📅 Назначить дату', callback_data: 'set_date' }],
              [{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]
            ]
          };

          const payload = {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            message_id: parseInt(telegramMessageId, 10),
            reply_markup: updatedKeyboard
          };

          let editSuccess = false;
          try {
            const editRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                text: updatedText,
                parse_mode: 'Markdown'
              })
            });
            const editData = await editRes.json();
            if (editRes.ok && editData.ok) {
              editSuccess = true;
              console.log('Successfully edited main message text');
            } else {
              console.log('editMessageText failed, trying editMessageCaption:', JSON.stringify(editData));
            }
          } catch (err) {
            console.error('editMessageText threw:', err.message);
          }

          if (!editSuccess) {
            try {
              const editCapRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...payload,
                  caption: updatedText,
                  parse_mode: 'Markdown'
                })
              });
              const editCapData = await editCapRes.json();
              if (editCapRes.ok && editCapData.ok) {
                console.log('Successfully edited main message caption');
              } else {
                console.error('editMessageCaption also failed:', JSON.stringify(editCapData));
              }
            } catch (errCaption) {
              console.error('editMessageCaption failed:', errCaption.message);
            }
          }
        } catch (err) {
          console.error('Failed to edit main message in Telegram:', err.message);
        }
      }

      // 4. Send separate reply notification to Telegram
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
