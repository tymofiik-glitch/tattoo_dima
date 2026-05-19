// Shared Telegram helpers: main message template, edit primitives, and
// timeline appender. All bot endpoints (telegram-webhook, payment-webhook,
// cron-aftercare) build the client card from `buildMainMessage` so we keep
// one source of truth.

const STATUS_HEADERS = {
  accepted:        '✅ *ЗАЯВКА ПРИНЯТА*',
  deposit_paid:    '💳 *ДЕПОЗИТ ОПЛАЧЕН*',
  date_set:        '📅 *ДАТА НАЗНАЧЕНА*',
  session_done:    '🎨 *СЕАНС ЗАВЕРШЁН*',
  error:           '⚠️ *ОШИБКА СОХРАНЕНИЯ*'
};

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
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

// Renders the canonical client card. `timeline` is an array of strings
// (newest at the bottom) appended after the details block.
function buildMainMessage(fields, { status = 'accepted', timeline = [] } = {}) {
  const header = STATUS_HEADERS[status] || STATUS_HEADERS.accepted;

  const name      = fields.Name      || 'Unknown';
  const email     = fields.Email     || 'N/A';
  const instagram = fields.Instagram || 'N/A';
  const phone     = fields.Phone     || 'N/A';
  const size      = fields.Size      || 'N/A';
  const placement = fields.Placement || 'N/A';
  const budget    = fields.Budget    || 'N/A';
  const idea      = fields.Idea      || 'N/A';
  const notes     = fields.Notes     || 'None';

  const timelineBlock = timeline.length
    ? `\n\n📋 *TIMELINE*\n${timeline.join('\n')}`
    : '';

  return `
${header}
━━━━━━━━━━━━━━━━━━
👤 *CLIENT:* ${name}
📧 *EMAIL:* ${email}
📸 *IG:* ${instagram}
📞 *PHONE:* ${phone}

🖼️ *TATTOO DETAILS*
📐 *SIZE:* ${size}
📍 *PLACE:* ${placement}
💰 *BUDGET:* ${budget}

📝 *IDEA:*
${idea}

📓 *NOTES:*
${notes}
━━━━━━━━━━━━━━━━━━${timelineBlock}`.trim();
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
  const result = await editMainMessage({ chatId, messageId, text, replyMarkup });
  return { ok: true, telegramOk: result.ok };
}

module.exports = {
  STATUS_HEADERS,
  buildMainMessage,
  editMainMessage,
  notifyAlena,
  appendTimelineAndEdit,
  parseTimeline,
  serializeTimeline
};
