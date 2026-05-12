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
    'Telegram Chat Link':   telegramLink
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

async function deleteAirtableLead(messageId) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
  if (!airtableToken || !airtableBase) return false;

  const formula = encodeURIComponent(`{Telegram Message ID} = '${messageId}'`);
  try {
    const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, {
      headers: { 'Authorization': `Bearer ${airtableToken}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.records && data.records.length > 0) {
      const recordId = data.records[0].id;
      await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${airtableToken}` }
      });
      return true;
    }
  } catch(e) { console.error('Delete error', e); }
  return false;
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

  if (data?.startsWith('chat|') || data === 'cancel_delete') {
    let ok = true;
    let name = extractField(msgText, 'CLIENT') || 'Client';
    let phone = extractField(msgText, 'PHONE') || '0';

    if (data?.startsWith('chat|')) {
      const parts = data.split('|');
      phone = parts[1] || phone;
      name = parts[2] || name;
      ok = await createAirtableLead(msgText, msgId, chatId);
    }

    const wa   = `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
    const igRaw = extractField(msgText, 'IG').replace('@', '');
    const ig   = igRaw ? `https://instagram.com/${igRaw}` : null;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 WhatsApp', url: wa },
          ...(ig ? [{ text: '📸 Instagram', url: ig }] : [])
        ],
        [{ 
          text: '💳 Ссылка на депозит', 
          url: `https://${req.headers.host || 'tattoodima.com'}/deposit?name=${encodeURIComponent(name)}&email=${encodeURIComponent(extractField(msgText, 'EMAIL') || '')}` 
        }],
        [{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]
      ]
    };

    const newHeader = ok ? '✅ *ЗАЯВКА ПРИНЯТА*' : '⚠️ *ОШИБКА СОХРАНЕНИЯ*';
      
    const newText = `
${newHeader}
━━━━━━━━━━━━━━━━━━
👤 *CLIENT:* ${name}
📧 *EMAIL:* ${extractField(msgText, 'EMAIL') || 'N/A'}
📸 *IG:* ${extractField(msgText, 'IG') || 'N/A'}
📞 *PHONE:* ${phone}

🖼️ *TATTOO DETAILS*
📐 *SIZE:* ${extractField(msgText, 'SIZE') || 'N/A'}
📍 *PLACE:* ${extractField(msgText, 'PLACE') || 'N/A'}
💰 *BUDGET:* ${extractField(msgText, 'BUDGET') || 'N/A'}

📝 *IDEA:*
${extractField(msgText, 'IDEA') || 'N/A'}

📓 *NOTES:*
${extractField(msgText, 'NOTES') || 'None'}
━━━━━━━━━━━━━━━━━━`.trim();

    const method = message.caption ? 'editMessageCaption' : 'editMessageText';
    const payload = {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    };
    
    if (message.caption) {
      payload.caption = newText;
    } else {
      payload.text = newText;
    }

    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.error('Telegram Edit Error:', err));

  } else if (data === 'reject' || data === 'ask_reject') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '⚠️ Точно отклонить заявку?', callback_data: 'ignore' }],
        [
          { text: '✅ Да, отклонить', callback_data: 'confirm_reject' },
          { text: '🔙 Отмена', callback_data: 'cancel_reject' }
        ]
      ]
    };
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: keyboard })
    });
  } else if (data === 'cancel_reject') {
    const phone = extractField(msgText, 'PHONE') || '0';
    const name = extractField(msgText, 'CLIENT') || 'Client';
    const keyboard = {
      inline_keyboard: [[
        { text: '💬 Start Chat', callback_data: `chat|${phone}|${name}` },
        { text: '❌ Reject', callback_data: 'reject' }
      ]]
    };
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: keyboard })
    });
  } else if (data === 'confirm_reject') {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId })
    });
  } else if (data === 'ask_delete') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '⚠️ Удалить из базы и закрыть?', callback_data: 'ignore' }],
        [
          { text: '✅ Да, удалить', callback_data: 'confirm_delete' },
          { text: '🔙 Отмена', callback_data: 'cancel_delete' }
        ]
      ]
    };
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: keyboard })
    });
  } else if (data === 'confirm_delete') {
    await deleteAirtableLead(msgId);
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId })
    });
  }

  return res.status(200).json({ ok: true });
};
