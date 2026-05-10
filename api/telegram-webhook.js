function extractField(text, label) {
  if (!text) return '';
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = text.match(regex);
  if (match) return match[1].replace(/\*/g, '').trim();
  return '';
}

async function createAirtableLead(messageText, messageId) {
  console.log('--- STARTING AIRTABLE CREATE ---');
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  
  const fields = {
    Name: extractField(messageText, 'CLIENT') || 'Unknown',
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

  console.log('Airtable Payload:', JSON.stringify(fields));

  try {
    const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${airtableToken}`
      },
      body: JSON.stringify({ fields })
    });
    const data = await res.json();
    console.log('Airtable Response:', res.status, JSON.stringify(data));
    return res.ok;
  } catch (e) {
    console.error('Airtable Fetch Error:', e.message);
    return false;
  }
}

module.exports = async (req, res) => {
  console.log('--- WEBHOOK REQUEST RECEIVED ---');
  
  // Telegram needs 200 OK fast
  try {
    const body = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!body || !body.callback_query) {
      console.log('No callback query in body');
      return res.status(200).json({ ok: true });
    }

    const { id, data, message } = body.callback_query;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const messageText = message.text || message.caption || '';

    console.log('Callback Data:', data);
    console.log('Message Text Snippet:', messageText.substring(0, 50));

    // Answer immediately to stop the spinner
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id })
    }).catch(e => console.error('Error answering callback:', e.message));

    if (data.startsWith('chat|')) {
      console.log('Handling Start Chat...');
      const parts = data.split('|');
      const phone = parts[1] || '0';
      const name = parts[2] || 'Client';
      
      const success = await createAirtableLead(messageText, messageId);

      if (success) {
        console.log('Airtable success, sending confirmation messages...');
        const igHandle = extractField(messageText, 'IG').replace('@', '');
        const waLink = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
        const igLink = igHandle ? `https://instagram.com/${igHandle}` : null;

        const inline_keyboard = [[{ text: '📱 WhatsApp', url: waLink }]];
        if (igLink) inline_keyboard[0].push({ text: '📸 Instagram', url: igLink });
        inline_keyboard.push([{ text: '💳 Issue Deposit', callback_data: `deposit|${phone}|${name}` }]);

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ *Lead Saved!* Data is in Airtable.\nReady to contact *${name}*?`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard }
          })
        });

        // Hide original buttons
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
        }).catch(() => {});
      } else {
        console.log('Airtable failed, notifying user...');
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: '⚠️ Failed to save to Airtable. Check Vercel logs.' })
        });
      }
    } else if (data === 'reject') {
      console.log('Handling Reject...');
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '❌ Rejected.' })
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('CRITICAL WEBHOOK ERROR:', error.stack);
    return res.status(200).json({ error: error.message });
  }
};
