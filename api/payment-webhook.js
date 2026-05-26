const { sendBookingConfirmation } = require('./utils/email');
const { generateIcs, googleCalendarUrl } = require('./utils/ics');
const { appendTimelineAndEdit, notifyAlena, escapeMd, getSessionDateTime } = require('./utils/telegram');
const { setSecurityHeaders } = require('./utils/security');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body;
  if (!id) return res.status(400).send('Missing payment ID');
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return res.status(400).send('Invalid payment ID format');

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY;

  try {
    const response = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_KEY}` }
    });
    const payment = await response.json();

    if (payment.status !== 'paid') {
      console.log('Payment status updated:', payment.status);
      return res.status(200).send('OK');
    }

    const { name, email, leadId } = payment.metadata;
    console.log('Payment SUCCESS:', id, payment.metadata);

    let record = null;
    let telegramMessageId = null;
    let hasSessionDate = false;

    // 1. Fetch lead from Airtable first to check if Session Date is set
    if (leadId) {
      try {
        const airtableRes = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/CRM_Leads/${leadId}`, {
          headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}` }
        });
        if (airtableRes.ok) {
          record = await airtableRes.json();
          telegramMessageId = record.fields?.['Telegram Message ID'];
          hasSessionDate = !!record.fields?.['Session Date'];
        } else {
          console.error('Failed to fetch Airtable lead. Status:', airtableRes.status);
        }
      } catch (err) {
        console.error('Failed to fetch Airtable lead:', err.message);
      }
    }

    // 2. Update Airtable status + payment metadata
    if (leadId) {
      try {
        const targetStatus = hasSessionDate ? "📅 Date Set" : "💳 Deposit Paid";
        const patchFields = {
          "Status": targetStatus,
          "Mollie Payment ID": id,
          "Payment Date": new Date().toISOString()
        };
        if (hasSessionDate) {
          patchFields["Session Status"] = "scheduled";
        }

        const patchRes = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/CRM_Leads/${leadId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields: patchFields })
        });
        if (!patchRes.ok) {
          const errText = await patchRes.text();
          throw new Error(`Airtable ${patchRes.status}: ${errText}`);
        }
        console.log('Airtable updated for lead:', leadId);

        // Update local record representation
        if (record) {
          record.fields = { ...record.fields, ...patchFields };
        }
      } catch (err) {
        console.error('Airtable update failed:', err.message);
        await notifyAlena(
          `⚠️ *PAYMENT WEBHOOK ERROR*\n` +
          `Lead: \`${leadId}\`\nPayment: \`${id}\`\n` +
          `Airtable PATCH failed: ${err.message}\n` +
          `Manager action needed: запиши депозит вручную.`
        );
      }
    }

    // 3. Re-render the Telegram card with timeline update
    if (record) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const statusOverride = hasSessionDate ? 'date_set' : 'deposit_paid';
        await appendTimelineAndEdit(
          record,
          `💳 Deposit paid · ${today}`,
          { status: statusOverride }
        );
      } catch (err) {
        console.error('Failed to refresh Telegram main message:', err.message);
      }
    }

    // 4. Send email first so the Telegram reply can confirm it was sent.
    const sessionDate = record ? getSessionDateTime(record.fields) : null;
    let emailSent = false;
    let emailError = null;

    if (email) {
      try {
        const clientName = name || record?.fields?.Name || 'Client';
        const address = record?.fields?.Address || null;
        const icsContent = sessionDate ? generateIcs({ clientName, clientEmail: email, sessionDate, address }) : null;
        const googleUrl  = sessionDate ? googleCalendarUrl({ sessionDate, address }) : null;

        await sendBookingConfirmation({ name: clientName, email, sessionDate, address, icsContent, googleUrl });
        console.log('Booking confirmation email sent');
        emailSent = true;
      } catch (err) {
        console.error('Email sending failed:', err.message);
        emailError = err.message;
        await notifyAlena(
          `⚠️ *EMAIL FAILED*\n` +
          `Client: ${email}\nPayment: \`${id}\`\n` +
          `Error: ${err.message}\n` +
          `Manager action: напиши клиенту вручную.`
        );
      }
    }

    // 5. Single combined reply: deposit paid + email status + session time
    const sessionLine = sessionDate
      ? sessionDate.toLocaleString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
        })
      : null;

    const lines = [
      `💰 *Депозит оплачен*`,
      ``,
      `👤 *Client:* ${escapeMd(name || 'Unknown')}`,
      `💶 *Amount:* ${payment.amount.value} ${payment.amount.currency}`
    ];
    if (sessionLine) lines.push(`📅 *Session:* ${escapeMd(sessionLine)} (Amsterdam)`);
    if (emailSent) {
      lines.push(`✉️ *Email sent:* ${escapeMd(email || '—')}`);
    } else if (email) {
      lines.push(`⚠️ *Email FAILED:* ${escapeMd(emailError || 'unknown')}`);
    }
    lines.push(``);
    lines.push(sessionLine
      ? `✅ Сессия подтверждена, календарь отправлен клиенту.`
      : `✅ Депозит зафиксирован. Дата ещё не назначена.`);

    try {
      const sendPayload = {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: lines.join('\n'),
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

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};
