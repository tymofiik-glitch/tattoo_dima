const { sendRejectionEmail, sendBookingConfirmation } = require('./utils/email');
const { generateIcs, googleCalendarUrl } = require('./utils/ics');
const { buildMainMessage, buildKeyboard, appendTimelineAndEdit, escapeMd } = require('./utils/telegram');

const awaitingDate = {};
const awaitingAddress = {};

// ─── Inline calendar builder ──────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildCalendarKeyboard(cardMsgId, year, month, isReschedule) {
  const flag = isReschedule ? '1' : '0';
  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const rows = [];
  rows.push([
    { text: '◀', callback_data: `cal_nav_${cardMsgId}_${fmt(prev)}_${flag}` },
    { text: `${MONTH_NAMES[month]} ${year}`, callback_data: 'ignore' },
    { text: '▶', callback_data: `cal_nav_${cardMsgId}_${fmt(next)}_${flag}` }
  ]);
  rows.push(['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => ({ text: d, callback_data: 'ignore' })));
  const today = new Date(); today.setHours(0,0,0,0);
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let row = [];
  for (let i = 0; i < firstDow; i++) row.push({ text: ' ', callback_data: 'ignore' });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const past = new Date(year, month, d) < today;
    row.push({ text: past ? '·' : String(d), callback_data: past ? 'ignore' : `cal_day_${cardMsgId}_${ds}_${flag}` });
    if (row.length === 7) { rows.push(row); row = []; }
  }
  if (row.length) { while (row.length < 7) row.push({ text: ' ', callback_data: 'ignore' }); rows.push(row); }
  rows.push([{ text: '✖ Отмена', callback_data: `cal_cancel_${cardMsgId}` }]);
  return { inline_keyboard: rows };
}

function buildTimeKeyboard(cardMsgId, dateStr, isReschedule) {
  const flag = isReschedule ? '1' : '0';
  const hours = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  const rows = [];
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(y, m-1, d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
  rows.push([{ text: `📅 ${label} — выбери время:`, callback_data: 'ignore' }]);
  for (let i = 0; i < hours.length; i += 4)
    rows.push(hours.slice(i, i+4).map(h => ({ text: h, callback_data: `cal_ok_${cardMsgId}_${dateStr}_${h}_${flag}` })));
  rows.push([{ text: '◀ Назад', callback_data: `cal_nav_${cardMsgId}_${y}-${String(m).padStart(2,'0')}_${flag}` }]);
  return { inline_keyboard: rows };
}

async function saveSessionDate(token, chatId, calMsgId, cardMsgId, dateStr, timeStr, isReschedule) {
  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
  const sessionDate   = parseAmsterdamDate(`${dateStr} ${timeStr}`);

  // If the calendar was a standalone message, delete it
  if (String(calMsgId) !== String(cardMsgId)) {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: calMsgId })
    }).catch(() => {});
  }

  if (!sessionDate) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: '⚠️ Не удалось разобрать дату.' }) });
    return;
  }

  let record = null, depositPaid = false;
  try {
    if (airtableToken && airtableBase) {
      const formula = encodeURIComponent(`{Telegram Message ID} = '${cardMsgId}'`);
      const r = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, { headers: { 'Authorization': `Bearer ${airtableToken}` } });
      const d = await r.json();
      if (d.records?.length > 0) {
        record = d.records[0];
        depositPaid = !!record.fields['Mollie Payment ID'];
        if (!isReschedule && depositPaid && record.fields['Session Date']) isReschedule = true;
      }
    }
  } catch(e) { console.error('saveSessionDate Airtable fetch:', e.message); }

  try {
    if (record && airtableToken && airtableBase) {
      const { parseTimeline, serializeTimeline } = require('./utils/telegram');
      const cleanTimeline = parseTimeline(record.fields.Timeline).filter(t => !t.includes('Date set') && !t.includes('Rescheduled'));
      
      const fields = { 
        'Session Date': dateStr, 
        'Status': depositPaid ? '📅 Date Set' : (record.fields.Status || '💬 In Progress'), 
        'Session Status': 'scheduled',
        'Timeline': serializeTimeline(cleanTimeline)
      };
      
      await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${record.id}`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      const datePart = sessionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' });
      const timePart = sessionDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
      const humanDate = `${datePart}, ${timePart}`;
      const actionText = isReschedule ? `🔄 Rescheduled · ${humanDate}` : `📅 Date set · ${humanDate}`;
      await appendTimelineAndEdit({ ...record, fields: { ...record.fields, ...fields } }, actionText, { status: depositPaid ? 'date_set' : 'accepted' });
    }
  } catch(e) { console.error('saveSessionDate Airtable update:', e.message); }

  try {
    if ((depositPaid || isReschedule) && record?.fields?.Email) {
      const address = record.fields.Address || null;
      const name = record.fields.Name || 'Client';
      const email = record.fields.Email;
      const icsContent = generateIcs({ clientName: name, clientEmail: email, sessionDate, address });
      const gUrl = googleCalendarUrl({ sessionDate, address });
      await sendBookingConfirmation({ name, email, sessionDate, address, icsContent, googleUrl: gUrl });
    }
  } catch(e) { console.error('saveSessionDate email:', e.message); }

}

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
    'BUDGET': /💰\s*Budget:\s*([^\n]+)/i,
    'GROUP': /👥\s*Group:\s*(\d+)\s*people/i
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

async function createAirtableLead(messageText, messageId, chatId, topicId) {
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
    'Group Size':           extractField(messageText, 'GROUP') || '',
    'Status':               '💬 In Progress',
    'Telegram Message ID':  String(messageId || ''),
    'Telegram Chat Link':   telegramLink,
    ...(topicId ? { 'Telegram Topic ID': String(topicId) } : {})
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
  // Verify request came from Telegram via secret token
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
    const replyTo = body.message.reply_to_message;

    let originalMsgId = null;
    let clientName = '';
    let clientEmail = '';

    // 1. Try to get target message ID from the reply text (serverless-safe)
    if (replyTo?.text) {
      const idMatch = replyTo.text.match(/ID:\s*(\d+)/);
      if (idMatch) {
        originalMsgId = idMatch[1];
      }
    }

    const hasInMemory = awaitingDate[incomingChatId];

    // 2. Fallback to in-memory (same process, non-serverless)
    let isReschedule = hasInMemory?.isReschedule || false;
    if (!originalMsgId && hasInMemory) {
      originalMsgId = hasInMemory.originalMsgId;
      clientName = hasInMemory.clientName;
      clientEmail = hasInMemory.clientEmail;
    }

    // 3. Serverless fallback: if text looks like a date and no ID resolved yet,
    //    find the most recent lead in Airtable without a session date
    if (!originalMsgId && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(incomingText)) {
      const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
      const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
      if (airtableToken && airtableBase) {
        try {
          const formula = encodeURIComponent(`AND({Session Date} = '', {Status} != '❌ Rejected', {Status} != '⚠️ No-show', {Status} != '✅ Completed', {Telegram Message ID} != '')`);
          const r = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}&sort[0][field]=Created&sort[0][direction]=desc&maxRecords=1`, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
          });
          const d = await r.json();
          if (d.records?.length > 0) {
            originalMsgId = d.records[0].fields['Telegram Message ID'];
          }
        } catch(e) { console.error('Serverless date fallback failed:', e.message); }
      }
    }

    if (originalMsgId) {
      // Parse "YYYY-MM-DD HH:MM" (Amsterdam local time, DST-aware)
      const sessionDate = parseAmsterdamDate(incomingText);
      if (!sessionDate) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: incomingChatId,
            text: `⚠️ Не могу разобрать дату. Попробуй ещё раз в формате: 2025-06-15 14:00\n\nID: ${originalMsgId}`,
            reply_markup: { force_reply: true, selective: true }
          })
        });
        // Keep the state active
        if (!hasInMemory) {
          awaitingDate[incomingChatId] = { originalMsgId };
        }
        return res.status(200).json({ ok: true });
      }

      // Fetch lead from Airtable to get full details or verify existence
      const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
      const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
      let record = null;
      let depositPaid = false;

      if (airtableToken && airtableBase) {
        if (!/^\d+$/.test(String(originalMsgId))) {
          return res.status(400).json({ error: 'Invalid message ID' });
        }
        const formula = encodeURIComponent(`{Telegram Message ID} = '${originalMsgId}'`);
        try {
          const findRes = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, {
            headers: { 'Authorization': `Bearer ${airtableToken}` }
          });
          const findData = await findRes.json();
          if (findData.records?.length > 0) {
            record = findData.records[0];
            clientName = record.fields.Name || clientName || 'Client';
            clientEmail = record.fields.Email || clientEmail || '';
            depositPaid = record.fields.Status === '💳 Deposit Paid' || !!record.fields['Mollie Payment ID'];
            // Serverless-safe reschedule detection: deposit paid + date already set
            if (!hasInMemory && depositPaid && record.fields['Session Date']) isReschedule = true;
          }
        } catch (err) {
          console.error('Airtable lead fetch failed:', err.message);
        }
      }

      // If we don't have in-memory fallback data and Airtable fetch failed, use default placeholder
      if (!clientName) clientName = 'Client';

      // Clean up in-memory state since we have resolved it
      delete awaitingDate[incomingChatId];

      // Booking confirmation email is sent by payment-webhook when deposit is paid.
      // No email is triggered here — date is saved and deposit link is shown in the card.

      // Update Airtable with session date + Session Status, then refresh
      // the Telegram main message with a new Timeline entry via the shared
      // helper (keeps the card in sync across all bot/cron writers).
      if (record && airtableToken && airtableBase) {
        try {
          const fields = {
            'Session Date':   sessionDate.toISOString().split('T')[0],
            'Status':         depositPaid ? '📅 Date Set' : (record.fields.Status || '💬 In Progress'),
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
            { status: depositPaid ? 'date_set' : 'accepted' }
          );
        } catch (err) {
          console.error('Airtable session date update failed:', err.message);
        }
      }

      const dateStr = sessionDate.toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
      });

      // Send calendar email if deposit already paid (reschedule or initial date with existing deposit)
      if ((depositPaid || isReschedule) && clientEmail) {
        try {
          const address = record?.fields?.Address || null;
          const icsContent = generateIcs({ clientName: clientName || 'Client', clientEmail, sessionDate, address });
          const gUrl = googleCalendarUrl({ sessionDate, address });
          await sendBookingConfirmation({ name: clientName || 'Client', email: clientEmail, sessionDate, address, icsContent, googleUrl: gUrl });
        } catch(e) { console.error('Reschedule email failed:', e.message); }
      }

      let responseText = `✅ Дата ${isReschedule ? 'обновлена' : 'сохранена'}\n📅 *${escapeMd(dateStr)}*`;
      if (depositPaid || isReschedule) {
        responseText += `\n✉️ Письмо с ${isReschedule ? 'новым ' : ''}календарём отправлено на ${escapeMd(clientEmail || '—')}`;
      } else {
        responseText += `\n💳 В карточке клиента активирована кнопка _«Ссылка на депозит»_ с этой датой. Отправь её клиенту.`;
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: incomingChatId,
          text: responseText,
          parse_mode: 'Markdown'
        })
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  }

  // Handle photo replies — Dima sends session photos after completing a session
  if (body?.message?.photo && !body?.callback_query) {
    const replyTo = body.message.reply_to_message;
    if (replyTo?.text) {
      const recordMatch = replyTo.text.match(/RECORD:([a-zA-Z0-9]+)/) || replyTo.text.match(/\u200b([a-zA-Z0-9]{10,})/);
      if (recordMatch) {
        const recordId = recordMatch[1];
        const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
        const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
        // Get highest-res file_id from the photo array
        const photos = body.message.photo;
        const fileId = photos[photos.length - 1].file_id;
        try {
          // Fetch existing photo IDs and append
          const recRes = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${recordId}`, { headers: { 'Authorization': `Bearer ${airtableToken}` } });
          const recData = await recRes.json();
          const existing = recData.fields?.['Session Photo IDs'] || '';
          const updated = existing ? `${existing},${fileId}` : fileId;
          await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${recordId}`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Session Photo IDs': updated } })
          });
          const count = updated.split(',').length;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: body.message.chat.id, text: `✅ Фото сохранено (${count} всего) — будет в письме в 21:00.` })
          });
        } catch(e) { console.error('Photo save failed:', e.message); }
      }
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
  const topicId = message?.message_thread_id; // Forum Topic ID
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
    let existingRecordFields = {};

    if (data?.startsWith('chat|')) {
      const parts = data.split('|');
      phone = parts[1] || phone;
      name = parts[2] || name;
      const createdId = await createAirtableLead(msgText, msgId, chatId, topicId);
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
            existingRecordFields = findData.records[0].fields || {};
          }
        } catch (err) {
          console.error('Failed to retrieve existing record ID:', err.message);
        }
      }
    }

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
      Timeline:  existingRecordFields.Timeline || '',
      'Session Date': existingRecordFields['Session Date'],
      'Mollie Payment ID': existingRecordFields['Mollie Payment ID'],
      id: leadId
    };

    const keyboard = buildKeyboard(cardFields, ok ? 'accepted' : 'error');
    const newText = buildMainMessage(cardFields, {
      status: ok ? 'accepted' : 'error',
      timeline: existingRecordFields.Timeline ? existingRecordFields.Timeline.split('\n').filter(Boolean) : []
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
  } else if (data === 'reschedule') {
    const now = new Date();
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: buildCalendarKeyboard(msgId, now.getFullYear(), now.getMonth(), true) })
    });

  } else if (data === 'ask_complete') {
    const clientName = extractField(msgText, 'CLIENT') || 'Client';
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, message_id: msgId,
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ Отметить сеанс ${clientName} как завершённый?`, callback_data: 'ignore' }],
            [ { text: '🎁 Free Touchup', callback_data: 'complete_touchup_free' } ],
            [ { text: '💳 Touchup €50', callback_data: 'complete_touchup_paid' } ],
            [ { text: '✅ Без touchup', callback_data: 'confirm_complete' }, { text: '🔙 Отмена', callback_data: 'cancel_complete' } ]
          ]
        }
      })
    });

  } else if (data === 'cancel_complete') {
    const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
    const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
    if (airtableToken && airtableBase && msgId) {
      const formula = encodeURIComponent(`{Telegram Message ID} = '${msgId}'`);
      try {
        const r = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, { headers: { 'Authorization': `Bearer ${airtableToken}` } });
        const d = await r.json();
        if (d.records?.length > 0) {
          const rec = d.records[0];
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: buildKeyboard({ ...rec.fields, id: rec.id }, 'deposit_paid') })
          });
        }
      } catch(e) { console.error('cancel_complete restore failed:', e.message); }
    }

  } else if (data === 'confirm_complete' || data === 'complete_touchup_free' || data === 'complete_touchup_paid') {
    const touchupType = data === 'complete_touchup_free' ? 'free' : data === 'complete_touchup_paid' ? 'paid' : 'none';
    const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
    const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
    if (airtableToken && airtableBase && msgId) {
      const formula = encodeURIComponent(`{Telegram Message ID} = '${msgId}'`);
      try {
        const findRes = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, { headers: { 'Authorization': `Bearer ${airtableToken}` } });
        const findData = await findRes.json();
        if (findData.records?.length > 0) {
          const rec = findData.records[0];
          const clientName = rec.fields.Name || 'Client';
          const patchFields = { 'Session Status': 'completed', 'Status': '✅ Completed', 'Touchup Type': touchupType };
          await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${rec.id}`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: patchFields })
          });
          const today = new Date().toISOString().split('T')[0];
          const touchupNote = touchupType !== 'none' ? ` · touchup ${touchupType}` : '';
          await appendTimelineAndEdit(
            { ...rec, fields: { ...rec.fields, ...patchFields, id: rec.id } },
            `✅ Session completed · ${today}${touchupNote}`,
            { status: 'session_done' }
          );
          // Ask for session photos to attach to aftercare email
          const photoPrompt = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `📸 *Отправь фото тату для ${escapeMd(clientName)}*\nОтветь на это сообщение фото — прикреплю к письму в 21:00.\n\u200b${rec.id}`,
              parse_mode: 'Markdown',
              message_thread_id: rec.fields['Telegram Topic ID'] ? parseInt(rec.fields['Telegram Topic ID'], 10) : undefined,
              reply_to_message_id: rec.fields['Telegram Message ID'] ? parseInt(rec.fields['Telegram Message ID'], 10) : undefined,
              reply_markup: { force_reply: true, selective: true }
            })
          });
          const photoPromptData = await photoPrompt.json();
          console.log('Photo prompt sent, message_id:', photoPromptData.result?.message_id);
        }
      } catch(err) { console.error('confirm_complete failed:', err.message); }
    }

  } else if (data.startsWith('cal_nav_')) {
    // cal_nav_CARDMSGID_YYYY-MM_FLAG
    const parts = data.split('_');
    const cardMsgId = parts[2];
    const [year, month] = parts[3].split('-').map(Number);
    const isReschedule = parts[4] === '1';
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: buildCalendarKeyboard(cardMsgId, year, month - 1, isReschedule) })
    });

  } else if (data.startsWith('cal_day_')) {
    // cal_day_CARDMSGID_YYYY-MM-DD_FLAG
    const parts = data.split('_');
    const cardMsgId = parts[2];
    const dateStr = parts[3];
    const isReschedule = parts[4] === '1';
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: buildTimeKeyboard(cardMsgId, dateStr, isReschedule) })
    });

  } else if (data.startsWith('cal_ok_')) {
    // cal_ok_CARDMSGID_YYYY-MM-DD_HH:MM_FLAG
    const parts = data.split('_');
    const cardMsgId = parts[2];
    const dateStr = parts[3];
    const timeStr = parts[4];
    const isReschedule = parts[5] === '1';
    await saveSessionDate(token, chatId, msgId, cardMsgId, dateStr, timeStr, isReschedule);

  } else if (data === 'set_date') {
    const now = new Date();
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: buildCalendarKeyboard(msgId, now.getFullYear(), now.getMonth(), false) })
    });

  } else if (data === 'ask_no_show') {
    const clientName = extractField(msgText, 'CLIENT') || 'Client';
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: msgId,
        reply_markup: {
          inline_keyboard: [
            [{ text: `⚠️ No-show для ${clientName}? Aftercare не отправится.`, callback_data: 'ignore' }],
            [
              { text: '✅ Да, no-show', callback_data: 'confirm_no_show' },
              { text: '🔙 Отмена', callback_data: 'cancel_no_show' }
            ]
          ]
        }
      })
    });

  } else if (data === 'cancel_no_show' || data.startsWith('cal_cancel_')) {
    const isCalCancel = data.startsWith('cal_cancel_');
    const targetMsgId = isCalCancel ? data.split('_')[2] : msgId;

    if (isCalCancel && msgId != targetMsgId) {
      await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: msgId })
      });
      return res.status(200).json({ ok: true });
    }

    // Restore normal keyboard by re-fetching record state
    const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
    const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();
    if (airtableToken && airtableBase && targetMsgId) {
      const formula = encodeURIComponent(`{Telegram Message ID} = '${targetMsgId}'`);
      try {
        const r = await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`, {
          headers: { 'Authorization': `Bearer ${airtableToken}` }
        });
        const d = await r.json();
        if (d.records?.length > 0) {
          const rec = d.records[0];
          const fields = { ...rec.fields, id: rec.id };
          let status = 'accepted';
          if (fields['Session Status'] === 'completed' || fields['Status'] === '⚠️ No-show') {
            status = 'session_done';
          } else if (fields['Session Date']) {
            status = 'date_set';
          } else if (fields['Mollie Payment ID']) {
            status = 'deposit_paid';
          }
          await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: targetMsgId, reply_markup: buildKeyboard(fields, status) })
          });
        }
      } catch (err) { console.error('cancel restore failed:', err.message); }
    }

  } else if (data === 'confirm_no_show') {
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
          const rec = findData.records[0];
          await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${rec.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Session Status': 'no-show', 'Status': '⚠️ No-show' } })
          });
          const today = new Date().toISOString().split('T')[0];
          await appendTimelineAndEdit(
            { ...rec, fields: { ...rec.fields, id: rec.id, 'Session Status': 'no-show', 'Status': '⚠️ No-show' } },
            `⚠️ No-show · ${today}`,
            { status: 'session_done' }
          );
        }
      } catch (err) { console.error('confirm_no_show failed:', err.message); }
    }
  }

  return res.status(200).json({ ok: true });
};
