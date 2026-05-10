function extractField(text, label) {
  if (!text) return '';
  // Очищаем текст от лишних пробелов и скрытых символов
  const cleanText = text.replace(/\*/g, '');
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = cleanText.match(regex);
  return match ? match[1].trim() : '';
}

async function createAirtableLead(messageText, messageId) {
  console.log('--- ATTEMPTING AIRTABLE WRITE ---');
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  
  // Берем только самое важное для теста
  const fields = {
    "Name": extractField(messageText, 'CLIENT') || 'New Lead',
    "Phone": extractField(messageText, 'PHONE') || '000',
    "Email": extractField(messageText, 'EMAIL'),
    "Instagram": extractField(messageText, 'IG'),
    "Idea": extractField(messageText, 'IDEA'),
    "Size": extractField(messageText, 'SIZE'),
    "Placement": extractField(messageText, 'PLACE'),
    "Budget": extractField(messageText, 'BUDGET'),
    "Notes": extractField(messageText, 'NOTES'),
    "Status": '💬 In Progress',
    "Telegram Message ID": String(messageId || '')
  };

  console.log('Sending fields to Airtable:', JSON.stringify(fields));

  const response = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${airtableToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });

  const result = await response.json();
  console.log('Airtable Status:', response.status);
  console.log('Airtable Result:', JSON.stringify(result));

  return response.ok;
}

module.exports = async (req, res) => {
  console.log('Webhook triggered');
  
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { console.error('JSON Parse Error'); }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!body || !body.callback_query) {
    return res.status(200).send('No callback');
  }

  const { id, data, message } = body.callback_query;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const messageText = message.text || message.caption || '';

  // 1. Сразу отвечаем Телеграму
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id })
  }).catch(() => {});

  if (data.startsWith('chat|')) {
    console.log('Processing chat| data');
    const parts = data.split('|');
    const phone = parts[1] || '';
    const name = parts[2] || '';

    const success = await createAirtableLead(messageText, messageId);

    if (success) {
      const waLink = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
      const igHandle = extractField(messageText, 'IG').replace('@', '');
      const igLink = igHandle ? `https://instagram.com/${igHandle}` : null;

      const inline_keyboard = [[{ text: '📱 WhatsApp', url: waLink }]];
      if (igLink) inline_keyboard[0].push({ text: '📸 Instagram', url: igLink });
      inline_keyboard.push([{ text: '💳 Issue Deposit', callback_data: `deposit|${phone}|${name}` }]);

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ *Success!* Lead saved to CRM.\nReady to contact *${name}*?`,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard }
        })
      });

      // Убираем кнопку Start Chat
      await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
      }).catch(() => {});
    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '❌ Error saving to Airtable. Check logs.' })
      });
    }
  }

  return res.status(200).send('OK');
};
