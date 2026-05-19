const { sendRejectionEmail, sendAppointmentCalendar } = require('./utils/email');
const { generateIcs, googleCalendarUrl } = require('./utils/ics');
const { buildMainMessage, appendTimelineAndEdit, escapeMd } = require('./utils/telegram');

// In-memory state for the two-step "set appointment" flow per chat.
// Step 1: awaitingDate    — Alena enters date/time
// Step 2: awaitingAddress — Alena enters the studio address
const awaitingDate = {};
const awaitingAddress = {};

function parseAmsterdamDate(dateStr) {
  const isoStr = dateStr.trim().replace(' ', 'T') + ':00';
  const candidate = new Date(isoStr + '+01:00');
  if (isNaN(candidate.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(candidate);
  const getVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);
  const localUTC = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour') === 24 ? 0 : getVal('hour'),
    getVal('minute')
  );
  const offsetHours = (localUTC - candidate.getTime()) / (3600 * 1000);
  const finalOffsetStr = '+' + String(offsetHours).padStart(2, '0') + ':00';
  return new Date(isoStr + finalOffsetStr);
}

// Парсит поле из текста сообщения — ищет LABEL: как подстроку в каждой строке
// Поддерживает значения на той же строке и на следующей
function extractField(text, label) {
  if (!text) return '';
  // Clean basic markdown formatting characters EXCEPT underscore (to preserve emails/IGs)
  const clean = text.replace(/[*`\[\]\\]/g, '');
  
  // Regex patterns for the NEW template
  const newPatterns = {
    'CLIENT': /👤\s*([^\n]+)/,
    'EMAIL': /📧\s*([^\n]+)/,
    'IG': /📸\s*([^\n•]+)/,
    'PHONE': /📱\s*([^\n•]+)/,
    'SIZE': /📐\s*Size:\s*([^\n•]+)/i,
    'PLACE': /📍\s*Place:\s*([^\n]+)/i,
    'BUDGET': /💰\s*Budget:\s*([^\n]+)/i
  };

  if (newPatterns[label]) {
    const match = clean.match(newPatterns[label]);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Multiline blocks for IDEA and NOTES in the NEW template
  if (label === 'IDEA' || label === 'NOTES') {
    const header = label === 'IDEA' ? '📝 IDEA:' : '📓 NOTES:';
    const lines = clean.split('\n');
    let capture = false;
    let result = [];
    for (let line of lines) {
      if (line.includes('TIMELINE') || (label === 'IDEA' && line.includes('📓 NOTES:'))) {
        capture = false;
        break;
      }
      if (capture) {
        let val = line.trim();
        if (val.startsWith('▎')) {
          val = val.replace(/^▎\s*/, '');
        }
        // Remove leading/trailing underscores used for italics
        val = val.replace(/^_/, '').replace(/_$/, '').trim();
        
        if (val && val !== 'N/A') {
          result.push(val);
        }
      }
      if (line.includes(header)) capture = true;
    }
    if (result.length > 0) return result.join('\n');
  }

  // Fallback to legacy label search
  const lines = clean.split('\n');
  const search = label.toUpperCase() + ':';
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    const idx = upper.indexOf(search);
    if (idx !== -1) {
      const inline = lines[i].substring(idx + search.length).trim();
      if (inline) return inline;
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
    if (res.ok && data.id) {
      return data.id;
    }
    return null;
  } catch (err) {
    console.error('Airtable fetch error:', err.message);
    return null;
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

  // Handle plain text message — may be a date input from Alena
  if (body?.message?.text && !body?.callback_query) {
    const incomingText = body.message.text.trim();
    const incomingChatId = body.message.chat?.id;

    // ─── Step 1: receive date → send appointment email immediately ───
    if (awaitingDate[incomingChatId]) {
      const { clientName, clientEmail, originalMsgId } = awaitingDate[incomingChatId];
      delete awaitingDate[incomingChatId];

      // Parse "YYYY-MM-DD HH:MM" (Amsterdam local time, DST-aware)
      const sessionDate = parseAmsterdamDate(incomingText);
      if (!sessionDate) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: incomingChatId,
            text: '⚠️ Не могу разобрать дату. Попробуй ещё раз в формате: 2025-06-15 14:00'
          })
        });
        awaitingDate[incomingChatId] = { clientName, clientEmail, originalMsgId };
        return res.status(200).json({ ok: true });
      }

      // Address is null (automatically falls back to default studio address)
      const address = null;
      const icsContent = generateIcs({ clientName, clientEmail, sessionDate, address });
      const googleUrl  = googleCalendarUrl({ sessionDate, address });

      if (clientEmail) {
        try {
          await sendAppointmentCalendar({ name: clientName, email: clientEmail, sessionDate, address, icsContent, googleUrl });
        } catch (err) {
          console.error('Email #3b failed:', err.message);
        }
      }

      // Update Airtable with session date + Session Status, then refresh
      // the Telegram main message with a new Timeline entry via the shared
      // helper (keeps the card in sync across all bot/cron writers).
      const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
      const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
      if (airtableToken && airtableBase && originalMsgId) {
        const formula = encodeURIComponent(`{Telegram Message ID} = '${originalMsgId}'`);
        try {
          const findRes = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
          });
          const findData = await findRes.json();
          if (findData.records?.length > 0) {
            const record = findData.records[0];
            const fields = {
              'Session Date':   sessionDate.toISOString().split('T')[0],
              'Status':         '📅 Date Set',
              'Session Status': 'scheduled'
            };
            await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${record.id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields })
            });

            const merged = { ...record, fields: { ...record.fields, ...fields } };
            const humanDate = sessionDate.toLocaleDateString('en-GB', {
              year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
            });
            await appendTimelineAndEdit(
              merged,
              `📅 Date set · ${humanDate}`,
              { status: 'date_set' }
            );
          }
        } catch (err) {
          console.error('Airtable session date update failed:', err.message);
        }
      }

      const dateStr = sessionDate.toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
      });

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: incomingChatId,
          text: `✅ Сессия назначена\n📅 *${escapeMd(dateStr)}*\n📍 _(адрес по умолчанию)_\n✉️ Письмо с .ics отправлено на ${escapeMd(clientEmail || '—')}`,
          parse_mode: 'Markdown'
        })
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  }

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
    let leadId = '';

    if (data?.startsWith('chat|')) {
      const parts = data.split('|');
      phone = parts[1] || phone;
      name = parts[2] || name;
      const createdId = await createAirtableLead(msgText, msgId, chatId);
      if (createdId) {
        ok = true;
        leadId = createdId;
      } else {
        ok = false;
      }
    } else {
      // cancel_delete: retrieve existing record
      const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
      const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
      if (airtableToken && airtableBase && msgId) {
        const formula = encodeURIComponent(`{Telegram Message ID} = '${msgId}'`);
        try {
          const findRes = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
          });
          const findData = await findRes.json();
          if (findData.records?.length > 0) {
            leadId = findData.records[0].id;
          }
        } catch (err) {
          console.error('Failed to retrieve existing record ID:', err.message);
        }
      }
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
          url: `https://kaktuz.ink/deposit?name=${encodeURIComponent(name)}&email=${encodeURIComponent(extractField(msgText, 'EMAIL') || '')}${leadId ? `&leadId=${leadId}` : ''}` 
        }],
        [{ text: '📅 Назначить дату', callback_data: 'set_date' }],
        [{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]
      ]
    };

    const cardFields = {
      Name:      name,
      Email:     extractField(msgText, 'EMAIL'),
      Instagram: extractField(msgText, 'IG'),
      Phone:     phone,
      Size:      extractField(msgText, 'SIZE'),
      Placement: extractField(msgText, 'PLACE'),
      Budget:    extractField(msgText, 'BUDGET'),
      Idea:      extractField(msgText, 'IDEA'),
      Notes:     extractField(msgText, 'NOTES'),
      Timeline:  ''
    };
    const newText = buildMainMessage(cardFields, {
      status: ok ? 'accepted' : 'error'
    });

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
    const clientEmail = extractField(msgText, 'EMAIL');
    const clientName  = extractField(msgText, 'CLIENT') || 'there';
    if (clientEmail) {
      try {
        await sendRejectionEmail({ name: clientName, email: clientEmail });
        console.log('Rejection email sent successfully');
      } catch (err) {
        console.error('Email #2 failed:', err.message);
      }
    }
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
  } else if (data === 'set_date') {
    const clientName  = extractField(msgText, 'CLIENT') || 'Client';
    const clientEmail = extractField(msgText, 'EMAIL') || '';
    awaitingDate[chatId] = { clientName, clientEmail, originalMsgId: msgId };
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📅 Введи дату и время сеанса для *${escapeMd(clientName)}* в формате:\n\`2025-06-15 14:00\``,
        parse_mode: 'Markdown'
      })
    });
  }

  return res.status(200).json({ ok: true });
};
