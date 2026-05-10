const Busboy = require('busboy');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const fields = {};
        const fileUploads = [];
        const busboy = Busboy({ headers: req.headers });

        await new Promise((resolve, reject) => {
            busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
            busboy.on('file', (fieldname, file, { filename, mimeType }) => {
                const chunks = [];
                file.on('data', (d) => chunks.push(d));
                file.on('end', () => {
                    if (chunks.length > 0) {
                        fileUploads.push({
                            filename,
                            content: Buffer.concat(chunks),
                            contentType: mimeType
                        });
                    }
                });
            });
            busboy.on('finish', resolve);
            busboy.on('error', reject);
            req.pipe(busboy);
        });

        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        let tgMessageId = '';

        if (token && chatId) {
            const sizeMap = { xs: 'XS \u2014 under 5cm', s: 'S \u2014 5\u201310cm', m: 'M \u2014 10\u201315cm', l: 'L \u2014 15cm+' };
            const budgetMap = { '150-300': '€150-300', '300-500': '€300-500', '500+': '€500+' };
            const displaySize = sizeMap[fields.size] || fields.size || 'Not specified';
            const displayBudget = budgetMap[fields.budget] || fields.budget || 'Not specified';

            const messageText = `
✨ *NEW TATTOO ENQUIRY* ✨
━━━━━━━━━━━━━━━━━━
👤 *CLIENT:* ${fields.name}
📧 *EMAIL:* ${fields.email}
📸 *IG:* ${fields.instagram}
📞 *PHONE:* ${fields.phone}

🖼️ *TATTOO DETAILS*
📐 *SIZE:* ${displaySize}
📍 *PLACE:* ${fields.placement}
💰 *BUDGET:* ${displayBudget}

📝 *IDEA:*
${fields.idea}

📓 *NOTES:*
${fields.notes || 'No additional notes'}
━━━━━━━━━━━━━━━━━━
            `.trim();

            const keyboard = {
                inline_keyboard: [[
                    { text: '💬 Start Chat', callback_data: `chat|${fields.phone}|${fields.name}` },
                    { text: '❌ Reject', callback_data: 'reject' }
                ]]
            };

            // Send text first
            const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: messageText,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                })
            });
            const tgData = await tgRes.json();
            tgMessageId = tgData.result?.message_id?.toString() || '';

            // Send photos if any
            for (const upload of fileUploads) {
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('photo', new Blob([upload.content], { type: upload.contentType }), upload.filename);
                formData.append('reply_to_message_id', tgMessageId);

                await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
                    method: 'POST',
                    body: formData
                });
            }
        }

        // 2. Save to Airtable
        const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
        const airtableBase = process.env.AIRTABLE_BASE_ID?.trim();
        if (airtableToken && airtableBase) {
            const sizeMap = { xs: 'XS \u2014 under 5cm', s: 'S \u2014 5\u201310cm', m: 'M \u2014 10\u201315cm', l: 'L \u2014 15cm+' };
            const budgetMap = { '150-300': '€150-300', '300-500': '€300-500', '500+': '€500+' };
            
            await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${airtableToken}`
                },
                body: JSON.stringify({
                    fields: {
                        Name: String(fields.name || ''),
                        Email: String(fields.email || ''),
                        Instagram: String(fields.instagram || ''),
                        Phone: String(fields.phone || ''),
                        Idea: String(fields.idea || ''),
                        Size: String(sizeMap[fields.size] || fields.size || ''),
                        Placement: String(fields.placement || ''),
                        Budget: String(budgetMap[fields.budget] || fields.budget || ''),
                        Notes: String(fields.notes || ''),
                        Status: '🆕 New',
                        'Telegram Message ID': String(tgMessageId || '')
                    }
                })
            });
        }

        return res.status(200).json({ message: 'Success' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
