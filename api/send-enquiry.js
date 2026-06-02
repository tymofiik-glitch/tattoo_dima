const Busboy = require('busboy');
const { sendEnquiryConfirmation } = require('./utils/email');
const { escapeMd, notifyAlena } = require('./utils/telegram');
const { setCorsHeaders, setSecurityHeaders } = require('./utils/security');

// In-memory rate limiter: max 5 submissions per IP per hour
const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const times = (rateLimitMap.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) return true;
  times.push(now);
  rateLimitMap.set(ip, times);
  return false;
}

const MAX_FIELD_LEN = 3000;

function sanitizeField(val) {
  if (typeof val !== 'string') return '';
  return val.slice(0, MAX_FIELD_LEN).trim();
}

module.exports = async (req, res) => {
    setCorsHeaders(res, req.headers.origin);
    setSecurityHeaders(res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    console.log('--- ENQUIRY REQUEST RECEIVED ---');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    try {
        const fields = {};
        const fileUploads = [];
        
        // Use promise to handle busboy
        await new Promise((resolve, reject) => {
            const busboy = Busboy({ headers: req.headers });
            busboy.on('field', (name, val) => { fields[name] = sanitizeField(val); });
            busboy.on('file', (name, file, { filename, mimeType }) => {
                const chunks = [];
                file.on('data', (d) => chunks.push(d));
                file.on('end', () => {
                    if (chunks.length > 0) {
                        fileUploads.push({ filename, content: Buffer.concat(chunks), contentType: mimeType });
                    }
                });
            });
            busboy.on('finish', resolve);
            busboy.on('error', reject);
            req.pipe(busboy);
        });

        console.log('Parsed fields:', Object.keys(fields));

        if (!fields.name || !fields.email || !fields.idea) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email)) {
          return res.status(400).json({ error: 'Invalid email' });
        }

        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) throw new Error('Telegram credentials missing');

        const sizeMap = { xs: 'XS \u2014 under 5cm', s: 'S \u2014 5\u201310cm', m: 'M \u2014 10\u201315cm', l: 'L \u2014 15cm+' };
        const budgetMap = { '150-300': '€150-300', '300-500': '€300-500', '500+': '€500+' };
        const displaySize = sizeMap[fields.size] || fields.size || 'Not specified';
        const displayBudget = budgetMap[fields.budget] || fields.budget || 'Not specified';

        // Map form fields to the Airtable schema expected by buildMainMessage
        const groupSize = Math.min(6, Math.max(1, parseInt(fields.groupSize) || 1));
        const mappedFields = {
            Name: fields.name,
            Email: fields.email,
            Instagram: fields.instagram,
            Phone: fields.phone,
            Size: displaySize,
            Placement: fields.placement,
            Budget: displayBudget,
            Idea: fields.idea,
            Notes: fields.notes,
            ...(groupSize > 1 ? { 'Group Size': String(groupSize) } : {})
        };

        const { buildMainMessage } = require('./utils/telegram');
        const messageText = buildMainMessage(mappedFields, { status: 'accepted' });

        const keyboard = {
            inline_keyboard: [[
                { text: '💬 Start Chat', callback_data: `chat|${fields.phone || '0'}|${fields.name || 'Client'}` },
                { text: '❌ Reject', callback_data: 'reject' }
            ]]
        };

        // Send to Telegram. Treat 4xx as a real failure: returning success
        // here hides bad-Markdown rejections and leaves Alena unaware that
        // a lead arrived. On Markdown parse rejection, retry once as plain
        // text so the lead still surfaces (degraded, but visible).
        async function sendToTelegram(useMarkdown) {
            if (fileUploads.length > 0) {
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('photo', new Blob([fileUploads[0].content], { type: fileUploads[0].contentType }), fileUploads[0].filename);
                formData.append('caption', messageText);
                if (useMarkdown) formData.append('parse_mode', 'Markdown');
                formData.append('reply_markup', JSON.stringify(keyboard));
                return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: formData });
            }
            const payload = { chat_id: chatId, text: messageText, reply_markup: keyboard };
            if (useMarkdown) payload.parse_mode = 'Markdown';
            return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        let tgRes = await sendToTelegram(true);
        if (!tgRes.ok) {
            const errBody = await tgRes.text();
            console.error('Telegram Markdown send failed:', tgRes.status, errBody);
            tgRes = await sendToTelegram(false);
            if (tgRes.ok) {
                await notifyAlena(`⚠️ Markdown parse failed on enquiry — отправлено в plain text. Проверь данные клиента, в них могут быть символы \`_*[\\\`\`.\nFirst error: ${errBody.substring(0, 200)}`);
            }
        }
        if (!tgRes.ok) {
            const errBody = await tgRes.text();
            throw new Error(`Telegram send failed: ${tgRes.status} ${errBody.substring(0, 300)}`);
        }

        try {
            const tgData = await tgRes.json();
            const msgId = tgData?.result?.message_id;
            if (msgId) {
                await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: msgId, disable_notification: true })
                });
            }
        } catch (pinErr) {
            console.error('Failed to pin message:', pinErr.message);
        }

        if (fields.email) {
            try {
                await sendEnquiryConfirmation({ name: fields.name || 'there', email: fields.email });
                console.log('Enquiry confirmation email sent successfully');
            } catch (err) {
                console.error('Email #1 failed:', err.message);
            }
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('SERVER ERROR:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
