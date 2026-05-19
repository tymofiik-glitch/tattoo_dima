const Busboy = require('busboy');
const { sendEnquiryConfirmation } = require('./utils/email');
const { escapeMd, notifyAlena } = require('./utils/telegram');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    console.log('--- ENQUIRY REQUEST RECEIVED ---');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const fields = {};
        const fileUploads = [];
        
        // Use promise to handle busboy
        await new Promise((resolve, reject) => {
            const busboy = Busboy({ headers: req.headers });
            busboy.on('field', (name, val) => { fields[name] = val; });
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

        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) throw new Error('Telegram credentials missing');

        const sizeMap = { xs: 'XS \u2014 under 5cm', s: 'S \u2014 5\u201310cm', m: 'M \u2014 10\u201315cm', l: 'L \u2014 15cm+' };
        const budgetMap = { '150-300': '€150-300', '300-500': '€300-500', '500+': '€500+' };
        const displaySize = sizeMap[fields.size] || fields.size || 'Not specified';
        const displayBudget = budgetMap[fields.budget] || fields.budget || 'Not specified';

        const messageText = `
✨ *NEW TATTOO ENQUIRY* ✨
━━━━━━━━━━━━━━━━━━
👤 *CLIENT:* ${escapeMd(fields.name || 'N/A')}
📧 *EMAIL:* ${escapeMd(fields.email || 'N/A')}
📸 *IG:* ${escapeMd(fields.instagram || 'N/A')}
📞 *PHONE:* ${escapeMd(fields.phone || 'N/A')}

🖼️ *TATTOO DETAILS*
📐 *SIZE:* ${escapeMd(displaySize)}
📍 *PLACE:* ${escapeMd(fields.placement || 'N/A')}
💰 *BUDGET:* ${escapeMd(displayBudget)}

📝 *IDEA:*
${escapeMd(fields.idea || 'N/A')}

📓 *NOTES:*
${escapeMd(fields.notes || 'None')}
━━━━━━━━━━━━━━━━━━
        `.trim();

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
