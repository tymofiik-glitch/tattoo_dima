// Парсит поле из текста сообщения — ищет LABEL: как подстроку в каждой строке
// Поддерживает значения на той же строке и на следующей
function extractField(text, label) {
  if (!text) return '';
  const clean = text.replace(/\*/g, '');
  const lines = clean.split('\n');
  const search = label.toUpperCase() + ':';
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    const idx = upper.indexOf(search);
    if (idx !== -1) {
      const inline = lines[i].substring(idx + search.length).trim();
      // Если значение на той же строке — возвращаем его
      if (inline) return inline;
      // Иначе берём следующую непустую строку
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('━')) return next;
      }
    }
  }
  return '';
}

async function createAirtableLead(messageText, messageId, chatId) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();

  if (!airtableToken || !airtableBase) {
    console.error('Missing Airtable credentials');
    return false;
  }

  // Строим ссылку на сообщение в Telegram
  // Для приватного чата формат: https://t.me/c/{chat_id_without_minus100}/{message_id}
  let telegramLink = '';
  if (chatId && messageId) {
    // Если chat_id отрицательный (группа) — убираем -100 prefix
    const cleanChatId = String(chatId).replace(/^-100/, '');
    telegramLink = `https://t.me/c/${cleanChatId}/${messageId}`;
  }

  const fields = {
    'Name':                 extractField(messageText, 'CLIENT') || 'Unknown',
    'Email':                extractField(messageText, 'EMAIL'),
    'Instagram':            extractField(messageText, 'IG'),
    'Phone':                extractField(messageText, 'PHONE'),
    'Idea':                 extractField(messageText, 'IDEA'),
    'Size':                 extractField(messageText, 'SIZE'),
    'Placement':            extractField(messageText, 'PLACE'),
    'Budget':               extractField(messageText, 'BUDGET'),
    'Notes':                extractField(messageText, 'NOTES'),
    'Status':               '💬 In Progress',
    'Telegram Message ID':  String(messageId || ''),
    'Telegram Link':        telegramLink
  };

  console.log('Fields to write:', JSON.stringify(fields));

  try {
    const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${airtableToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    const data = await res.json();
    console.log('Airtable response:', res.status, JSON.stringify(data));
    return res.ok;
  } catch (err) {
    console.error('Airtable fetch error:', err.message);
    return false;
  }
}

module.exports = async (req, res) => {
  console.log('Webhook received, method:', req.method);

  // Vercel иногда не парсит body автоматически — обрабатываем оба случая
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { /* ignore */ }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  // Если нет callback — это просто ping, отвечаем OK
  if (!body?.callback_query) {
    return res.status(200).json({ ok: true });
  }

  const { id: callbackId, data, message } = body.callback_query;
  const chatId  = message?.chat?.id;
  const msgId   = message?.message_id;
  // Берем текст — для обычных сообщений это text, для фото с подписью — caption
  const msgText = message?.text || message?.caption || '';

  console.log('callback data:', data);
  console.log('message text (first 100):', msgText.substring(0, 100));

  // Сразу говорим Telegram "принял" — убираем крутилку с кнопки
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId })
  }).catch(() => {});

  if (data?.startsWith('chat|')) {
    const [, phone = '', name = 'Client'] = data.split('|');

    const ok = await createAirtableLead(msgText, msgId, chatId);

    if (ok) {
      const wa   = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
      const igRaw = extractField(msgText, 'IG').replace('@', '');
      const ig   = igRaw ? `https://instagram.com/${igRaw}` : null;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📱 WhatsApp', url: wa },
            ...(ig ? [{ text: '📸 Instagram', url: ig }] : [])
          ],
          [{ text: '💳 Issue Deposit', callback_data: `deposit|${phone}|${name}` }]
        ]
      };

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ *Lead saved to Airtable!*\n\nClient: *${name}*\nPhone: ${phone}\n\nReady to contact?`,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        })
      });

      // Скрываем кнопки Start Chat / Reject на оригинальном сообщении
      await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: msgId,
          reply_markup: { inline_keyboard: [] }
        })
      }).catch(() => {});

    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '❌ Failed to save to Airtable. Check Vercel logs.'
        })
      });
    }

  } else if (data === 'reject') {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '❌ Enquiry rejected.' })
    });

    // Убираем кнопки
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: msgId,
        reply_markup: { inline_keyboard: [] }
      })
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true });
};
