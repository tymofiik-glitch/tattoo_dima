// Shared Telegram helpers: main message template, edit primitives, and
// timeline appender. All bot endpoints (telegram-webhook, payment-webhook,
// cron-aftercare) build the client card from `buildMainMessage` so we keep
// one source of truth.

const STATUS_HEADERS = {
  accepted:        '🟢 *NEW LEAD*',
  deposit_paid:    '💳 *DEPOSIT PAID*',
  date_set:        '📅 *DATE SET*',
  session_done:    '✅ *COMPLETED*',
  error:           '⚠️ *ERROR*'
};

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

// Escape characters that would break Telegram's legacy `Markdown` parse mode
// when they appear inside user-supplied field values (Name, IG, Notes, etc).
// Keeping legacy Markdown rather than switching to MarkdownV2 because the
// rest of the bot already uses it; escaping per-value is the smallest fix.
function escapeMd(v) {
  return String(v ?? '').replace(/([_*`\[\]])/g, '\\$1');
}

function alenaChatId() {
  return process.env.TELEGRAM_CHAT_ID;
}

function airtableUrl(path) {
  const base = process.env.AIRTABLE_BASE_ID?.trim();
  return `https://api.airtable.com/v0/${base}${path}`;
}

function airtableAuth() {
  return { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN?.trim()}` };
}

// DST-aware parser: takes "YYYY-MM-DD HH:MM" (Amsterdam local) and returns a
// proper Date with the right offset for that calendar day (CET vs CEST).
function parseAmsterdamLocal(dateStr) {
  const isoStr = dateStr.trim().replace(' ', 'T') + ':00';
  const candidate = new Date(isoStr + '+01:00');
  if (isNaN(candidate.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(candidate);
  const getVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);
  const hour = getVal('hour') === 24 ? 0 : getVal('hour');
  const localUTC = Date.UTC(getVal('year'), getVal('month') - 1, getVal('day'), hour, getVal('minute'));
  const offsetHours = (localUTC - candidate.getTime()) / 3600000;
  const offsetStr = '+' + String(offsetHours).padStart(2, '0') + ':00';
  return new Date(isoStr + offsetStr);
}

// Parses session datetime (Amsterdam local) from the Timeline string.
// Returns a Date object or null. Looks for the line written by telegram-webhook:
//   "📅 Date set · 15 Jun 2025, 14:00"
function getSessionDateTime(fields) {
  const sessionDateStr = fields?.['Session Date'];
  if (!sessionDateStr) return null;
  const timeline = fields?.Timeline || '';
  for (const line of String(timeline).split('\n')) {
    const m = line.match(/📅\s*Date\s*set\s*·\s*[^\n,]+,\s*(\d{2}):(\d{2})/i);
    if (m) {
      const d = parseAmsterdamLocal(`${sessionDateStr} ${m[1]}:${m[2]}`);
      if (d) return d;
    }
  }
  return parseAmsterdamLocal(`${sessionDateStr} 12:00`);
}

function formatShortDate(date) {
  if (!date) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Amsterdam'
  });
}

// Single-CTA keyboard derived from lifecycle:
//   accepted (no date)        → WA/IG · 📅 Время + депозит · 🗑 delete
//   accepted (date set)       → WA/IG · 💳 Ссылка на депозит · {date} · 📝 Изменить дату · 🗑 delete
//   deposit_paid / date_set   → WA/IG · 📝 Изменить дату · 🗑 delete
//   session_done              → WA/IG only
function buildKeyboard(fields, status) {
  const phone = String(fields.Phone || '').replace(/[^0-9]/g, '');
  const igRaw = String(fields.Instagram || '').replace('@', '');
  const wa  = phone ? `https://wa.me/${phone}` : null;
  const ig  = igRaw ? `https://instagram.com/${igRaw}` : null;
  const top = [];
  if (wa) top.push({ text: '📱 WhatsApp', url: wa });
  if (ig) top.push({ text: `📸 @${igRaw}`, url: ig });

  const rows = top.length ? [top] : [];

  const depositPaid = status === 'deposit_paid' || !!fields['Mollie Payment ID'];
  const sessionDate = getSessionDateTime(fields);
  const dateSet = !!sessionDate;

  if (status === 'session_done') return { inline_keyboard: rows };

  if (!dateSet && !depositPaid) {
    rows.push([{ text: '📅 Время + депозит', callback_data: 'set_date' }]);
  } else if (dateSet && !depositPaid) {
    const shortDate = formatShortDate(sessionDate);
    const depositUrl =
      `https://kaktuz.ink/deposit` +
      `?name=${encodeURIComponent(fields.Name || '')}` +
      `&email=${encodeURIComponent(fields.Email || '')}` +
      (fields.id ? `&leadId=${fields.id}` : '') +
      `&date=${encodeURIComponent(sessionDate.toISOString())}` +
      (groupSize > 1 ? `&groupSize=${groupSize}` : '');
    rows.push([{ text: `💳 Ссылка на депозит · ${shortDate}`, url: depositUrl }]);
    rows.push([{ text: '📝 Изменить дату', callback_data: 'set_date' }, { text: '⚠️ No-show', callback_data: 'ask_no_show' }]);
  } else {
    // deposit paid — reschedule + mark complete
    rows.push([{ text: '📅 Перенести дату', callback_data: 'reschedule' }, { text: '✅ Завершить сеанс', callback_data: 'ask_complete' }]);
    rows.push([{ text: '⚠️ No-show', callback_data: 'ask_no_show' }]);
  }

  rows.push([{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]);

  return { inline_keyboard: rows };
}

// Renders the canonical client card. `timeline` is an array of strings
// (newest at the bottom) appended after the details block.
function buildMainMessage(fields, { status = 'accepted', timeline = [] } = {}) {
  const header = STATUS_HEADERS[status] || STATUS_HEADERS.accepted;

  const name      = escapeMd(fields.Name      || 'Unknown');
  const email     = escapeMd(fields.Email     || 'N/A');
  const rawIg     = String(fields.Instagram || '').replace(/@+/g, '');
  // Markdown hyperlink — brackets must NOT be escaped, only the handle text inside
  const igHandle  = rawIg.replace(/[_*`[\]]/g, '\\$1');
  const instagram = rawIg
    ? `[@${igHandle}](https://instagram.com/${rawIg})`
    : 'N/A';
  const phone     = escapeMd(fields.Phone     || 'N/A');
  const size      = escapeMd(fields.Size      || 'N/A');
  const placement = escapeMd(fields.Placement || 'N/A');
  const budget    = escapeMd(fields.Budget    || 'N/A');
  const groupSize = parseInt(fields['Group Size']) || 1;
  const groupLine = groupSize > 1 ? `\n👥 *Group:* ${groupSize} people · Deposit €${groupSize * 50}` : '';

  const formatQuote = (text) => {
    if (!text || text === 'N/A' || text === 'None') return '▎ _N/A_';
    return String(text).split('\n').map(line => `▎ _${escapeMd(line)}_`).join('\n');
  };

  const ideaBlock  = formatQuote(fields.Idea);
  const notesBlock = formatQuote(fields.Notes);

  const timelineBlock = timeline.length
    ? `\n\n📋 *TIMELINE*\n${timeline.map(escapeMd).join('\n')}`
    : '';

  let hashtag = '';
  if (status === 'accepted') hashtag = '#new\\_lead';
  else if (status === 'deposit_paid') hashtag = '#deposit\\_paid';
  else if (status === 'date_set') hashtag = '#date\\_set';
  else if (status === 'session_done') hashtag = '#completed';
  else if (status === 'error') hashtag = '#error';

  return `
${header}
👤 *${name}*

📱 ${phone} • 📸 ${instagram}
📧 ${email}

🖼 *TATTOO DETAILS*${groupLine}
📐 *Size:* ${size} • 📍 *Place:* ${placement}
💰 *Budget:* ${budget}

📝 *IDEA:*
${ideaBlock}

📓 *NOTES:*
${notesBlock}${timelineBlock}

${hashtag}`.trim();
}

// Edits a message, falling back from text → caption (photos/media messages
// only accept editMessageCaption). Returns { ok, error }.
async function editMainMessage({ chatId, messageId, text, replyMarkup }) {
  const t = token();
  const basePayload = {
    chat_id: chatId,
    message_id: parseInt(messageId, 10),
    parse_mode: 'Markdown'
  };
  if (replyMarkup) basePayload.reply_markup = replyMarkup;

  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, text })
    });
    const data = await res.json();
    if (res.ok && data.ok) return { ok: true };
  } catch (err) {
    // fall through to caption attempt
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/editMessageCaption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, caption: text })
    });
    const data = await res.json();
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function notifyAlena(text) {
  const t = token();
  const chatId = alenaChatId();
  if (!t || !chatId) return { ok: false, error: 'missing creds' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    const data = await res.json();
    return { ok: res.ok && data.ok, error: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Parses Timeline field (newline-separated strings) into array.
function parseTimeline(raw) {
  if (!raw) return [];
  return String(raw).split('\n').map(s => s.trim()).filter(Boolean);
}

function serializeTimeline(lines) {
  return lines.join('\n');
}

// Appends a line to the Timeline field in Airtable, patches the record,
// and re-renders the Telegram main message with the new state + optional
// status override. Returns { ok, telegramOk }.
async function appendTimelineAndEdit(record, line, { status, replyMarkup } = {}) {
  const fields    = record.fields || {};
  const messageId = fields['Telegram Message ID'];
  const chatId    = alenaChatId();

  const existing = parseTimeline(fields.Timeline);
  const next = [...existing, line];

  try {
    await fetch(airtableUrl(`/CRM_Leads/${record.id}`), {
      method: 'PATCH',
      headers: { ...airtableAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { Timeline: serializeTimeline(next) } })
    });
  } catch (err) {
    console.error('Timeline patch failed:', err.message);
  }

  if (!messageId || !chatId) return { ok: true, telegramOk: false };

  const updatedFields = { ...fields, id: record.id, Timeline: serializeTimeline(next) };
  const text = buildMainMessage(updatedFields, { status, timeline: next });
  const markup = replyMarkup || buildKeyboard(updatedFields, status);
  const result = await editMainMessage({ chatId, messageId, text, replyMarkup: markup });
  return { ok: true, telegramOk: result.ok };
}

module.exports = {
  STATUS_HEADERS,
  buildMainMessage,
  buildKeyboard,
  editMainMessage,
  notifyAlena,
  appendTimelineAndEdit,
  parseTimeline,
  serializeTimeline,
  getSessionDateTime,
  formatShortDate,
  escapeMd
};
