function extractField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

async function createAirtableLead(messageText, messageId) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  if (!airtableToken || !airtableBase) return;

  const payload = {
    fields: {
      Name: extractField(messageText, 'CLIENT'),
      Email: extractField(messageText, 'EMAIL'),
      Instagram: extractField(messageText, 'IG'),
      Phone: extractField(messageText, 'PHONE'),
      Idea: extractField(messageText, 'IDEA'),
      Size: extractField(messageText, 'SIZE'),
      Placement: extractField(messageText, 'PLACE'),
      Budget: extractField(messageText, 'BUDGET'),
      Notes: extractField(messageText, 'NOTES'),
      Status: '💬 In Progress',
      'Telegram Message ID': String(messageId || ''),
      'Telegram Link': `tg://openmessage?user_id=${process.env.TELEGRAM_CHAT_ID}&message_id=${messageId}`
    }
  };

  await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${airtableToken}`
    },
    body: JSON.stringify(payload)
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const body = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const resendKey = process.env.RESEND_API_KEY;

    if (body.callback_query) {
      const { id, data, message } = body.callback_query;
      const chatId = message.chat.id;
      const messageId = message.message_id;
      const messageText = message.text || message.caption || '';

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: id })
      });

      if (data.startsWith('chat|')) {
        const [_, phone, name] = data.split('|');
        
        // CREATE LEAD IN AIRTABLE ONLY NOW!
        await createAirtableLead(messageText, messageId);

        const waLink = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Данные добавлены в Airtable!\n🔗 [Написать ${name} в WhatsApp](${waLink})`,
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

      } else if (data === 'reject') {
        const clientEmail = extractField(messageText, 'EMAIL');
        const clientName  = extractField(messageText, 'CLIENT');

        await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, caption: messageText + '\n\n❌ *Rejected*', parse_mode: 'Markdown' })
        }).catch(() => {});
        
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: messageText + '\n\n❌ *Rejected*', parse_mode: 'Markdown' })
        }).catch(() => {});

        if (resendKey && clientEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: 'The Muse Ink <noreply@themuseink.com>',
              to: clientEmail,
              subject: 'Your enquiry at The Muse Ink',
              html: `<p>Dear ${clientName || 'there'}, thank you for your enquiry. Unfortunately, we cannot take it on at this time...</p>`
            })
          });
        }
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    return res.status(500).send('Error');
  }
};
