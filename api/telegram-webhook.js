function extractField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = text.match(regex);
  if (match) return match[1].replace(/\*/g, '').trim();
  return '';
}

async function createAirtableLead(messageText, messageId) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  if (!airtableToken || !airtableBase) return;

  const fields = {
    Name: extractField(messageText, 'CLIENT'),
    Email: extractField(messageText, 'EMAIL'),
    Instagram: extractField(messageText, 'IG'), // В сообщении IG, в базе Instagram
    Phone: extractField(messageText, 'PHONE'),
    Idea: extractField(messageText, 'IDEA'),
    Size: extractField(messageText, 'SIZE'),
    Placement: extractField(messageText, 'PLACE'),
    Budget: extractField(messageText, 'BUDGET'),
    Notes: extractField(messageText, 'NOTES'),
    Status: '💬 In Progress',
    'Telegram Message ID': String(messageId || '')
  };

  await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${airtableToken}`
    },
    body: JSON.stringify({ fields })
  });
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

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: id })
      });

      if (data.startsWith('chat|')) {
        const [_, phone, name] = data.split('|');
        
        await createAirtableLead(messageText, messageId);

        const waLink = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Lead saved to Airtable!\n🔗 [Write to ${name} in WhatsApp](${waLink})`,
            parse_mode: 'Markdown'
          })
        });

        const updatedKeyboard = {
          inline_keyboard: [[
            { text: '💳 Issue Deposit', callback_data: `deposit|${phone}|${name}` },
            { text: '❌ Reject', callback_data: 'reject' }
          ]]
        };

        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: updatedKeyboard })
        });
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    return res.status(200).send('OK'); // Always return OK to TG
  }
};
