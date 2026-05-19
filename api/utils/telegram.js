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

// Default keyboard derived from record state + lifecycle status, so timeline
// edits don't accidentally strip Alena's action buttons.
//   accepted     → WA/IG + deposit link + set_date + delete
//   deposit_paid → WA/IG + set_date + delete   (deposit link removed)
//   date_set     → WA/IG + set_date + delete   (lets her reschedule)
//   session_done → WA/IG only (no further actions expected)
function buildKeyboard(fields, status) {
  const phone = String(fields.Phone || '').replace(/[^0-9]/g, '');
  const igRaw = String(fields.Instagram || '').replace('@', '');
  const wa  = phone ? `https://wa.me/${phone}` : null;
  const ig  = igRaw ? `https://instagram.com/${igRaw}` : null;
  const top = [];
  if (wa) top.push({ text: '📱 WhatsApp', url: wa });
  if (ig) top.push({ text: '📸 Instagram', url: ig });

  const rows = top.length ? [top] : [];

  if (status === 'accepted' || status === 'error') {
    const depositUrl = `https://kaktuz.ink/deposit?name=${encodeURIComponent(fields.Name || '')}&email=${encodeURIComponent(fields.Email || '')}`;
    rows.push([{ text: '💳 Ссылка на депозит', url: depositUrl }]);
    rows.push([{ text: '📅 Назначить дату', callback_data: 'set_date' }]);
    rows.push([{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]);
  } else if (status === 'deposit_paid' || status === 'date_set') {
    rows.push([{ text: '📅 Назначить дату', callback_data: 'set_date' }]);
    rows.push([{ text: '🗑 Прекратить работу', callback_data: 'ask_delete' }]);
  }
  // session_done: only contact buttons; no further action buttons.

  return { inline_keyboard: rows };
}

// Renders the canonical client card. `timeline` is an array of strings
// (newest at the bottom) appended after the details block.
function buildMainMessage(fields, { status = 'accepted', timeline = [] } = {}) {
  const header = STATUS_HEADERS[status] || STATUS_HEADERS.accepted;

  const name      = escapeMd(fields.Name      || 'Unknown');
  const email     = escapeMd(fields.Email     || 'N/A');
  const rawIg     = String(fields.Instagram || '').replace('@', '');
  const instagram = rawIg ? escapeMd('@' + rawIg) : 'N/A';
  const phone     = escapeMd(fields.Phone     || 'N/A');
  const size      = escapeMd(fields.Size      || 'N/A');
  const placement = escapeMd(fields.Placement || 'N/A');
  const budget    = escapeMd(fields.Budget    || 'N/A');

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

🖼 *TATTOO DETAILS*
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

  const updatedFields = { ...fields, Timeline: serializeTimeline(next) };
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
  escapeMd
};
