function parseField(text, label) {
  const regex = new RegExp(label + ':\\s*(.+)');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

async function updateAirtableStatus(messageId, status, extraFields = {}) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  if (!airtableToken || !airtableBase) return;

  const searchRes = await fetch(
    `https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${encodeURIComponent(`{Telegram Message ID}="${messageId}"`)}`,
    { headers: { 'Authorization': `Bearer ${airtableToken}` } }
  );
  const searchData = await searchRes.json();
  const record = searchData.records?.[0];
  if (!record) return;

  await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${record.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${airtableToken}`
    },
    body: JSON.stringify({ fields: { Status: status, ...extraFields } })
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body = req.body; // Vercel parses JSON bodies automatically
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const resendKey = process.env.RESEND_API_KEY;

    if (body.callback_query) {
      const { id, data, message } = body.callback_query;
      const chatId = message.chat.id;
      const messageId = message.message_id;
      const originalText = message.text;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: id })
      });

      if (data.startsWith('chat|')) {
        const [_, phone, name] = data.split('|');
        const waLink = `https://wa.me/${phone}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔗 [Написать ${name} в WhatsApp](${waLink})`,
            parse_mode: 'Markdown'
          })
        });

        const updatedKeyboard = {
          inline_keyboard: [[
            { text: '💳 Выставить депозит', callback_data: `deposit|${phone}|${name}` },
            { text: '❌ Отклонить', callback_data: 'reject' }
          ]]
        };

        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: updatedKeyboard })
        });

        await updateAirtableStatus(messageId.toString(), '💬 In Progress');

      } else if (data === 'reject') {
        const clientEmail = parseField(originalText, 'Email');
        const clientName  = parseField(originalText, 'Client');

        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: originalText + '\n\n❌ *Rejected*',
            parse_mode: 'Markdown'
          })
        });

        await updateAirtableStatus(messageId.toString(), '❌ Rejected');

        if (resendKey && clientEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendKey}`
            },
            body: JSON.stringify({
              from: 'The Muse Ink <noreply@themuseink.com>',
              to: clientEmail,
              subject: 'Your enquiry at The Muse Ink',
              html: `
                <div style="font-family:'Georgia',serif;max-width:540px;margin:0 auto;color:#1c1814;padding:40px 24px;">
                  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8478;margin-bottom:32px;">The Muse Ink · Den Haag</p>
                  <h2 style="font-style:italic;font-weight:300;font-size:26px;margin-bottom:24px;">Dear ${clientName || 'there'},</h2>
                  <p style="line-height:1.85;color:#4a4540;">Thank you so much for reaching out and for your interest in working with us. We have carefully reviewed your enquiry and, unfortunately, we won't be able to take it on at this time.</p>
                  <p style="line-height:1.85;color:#4a4540;">This can happen for a variety of reasons — timing, style fit, or a full calendar — and it is in no way a reflection of your idea.</p>
                  <p style="line-height:1.85;color:#4a4540;">We sincerely wish you all the best in finding the right artist for your piece.</p>
                  <p style="margin-top:40px;line-height:1.85;color:#4a4540;">Warmly,<br/><strong style="font-style:italic;">Dmytro Bilynets</strong><br/><span style="font-size:12px;color:#8a8478;">The Muse Ink</span></p>
                </div>
              `
            })
          });
        }

      } else if (data.startsWith('deposit|')) {
        const [_, phone, name] = data.split('|');
        const depositLink = `https://themuseink.com/deposit?client=${encodeURIComponent(name)}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `💳 Ссылка на депозит для ${name} (€50):\n${depositLink}\n\nСкопируй и отправь клиенту в WhatsApp.`
          })
        });
      }
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).send('Error');
  }
};
