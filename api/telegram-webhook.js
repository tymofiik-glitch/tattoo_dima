function extractField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = text.match(regex);
  if (match) return match[1].replace(/\*/g, '').trim();
  return '';
}

async function createAirtableLead(messageText, messageId) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  if (!airtableToken || !airtableBase) return false;

  const fields = {
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
    'Telegram Message ID': String(messageId || '')
  };

  try {
    const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${airtableToken}`
      },
      body: JSON.stringify({ fields })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const body = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (body.callback_query) {
      const { id, data, message } = body.callback_query;
      const chatId = message.chat.id;
      const messageId = message.message_id;
      const messageText = message.text || message.caption || '';

      if (data.startsWith('chat|')) {
        const [_, phone, name] = data.split('|');
        const igHandle = extractField(messageText, 'IG').replace('@', '');
        
        // Показываем "часики" на кнопке
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: id, text: 'Saving to Airtable...' })
        });

        const success = await createAirtableLead(messageText, messageId);

        if (success) {
          const waLink = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
          const igLink = igHandle ? `https://instagram.com/${igHandle}` : null;

          const inline_keyboard = [[
            { text: '📱 WhatsApp', url: waLink }
          ]];
          if (igLink) inline_keyboard[0].push({ text: '📸 Instagram', url: igLink });
          inline_keyboard.push([{ text: '💳 Issue Deposit', callback_data: `deposit|${phone}|${name}` }]);

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `✅ *Success!* All data and references are now in Airtable CRM.\n\nReady to contact *${name}*?`,
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard }
            })
          });

          // Убираем кнопки из основного сообщения, чтобы не нажать дважды
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: '⚠️ Failed to save to Airtable. Please check credentials.' })
          });
        }
      } else if (data === 'reject') {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: id })
        });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: '❌ Enquiry rejected.' })
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    return res.status(200).send('OK');
  }
};
