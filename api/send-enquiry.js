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
                        fileUploads.push({ filename, content: Buffer.concat(chunks), contentType: mimeType });
                    }
                });
            });
            busboy.on('finish', resolve);
            busboy.on('error', reject);
            req.pipe(busboy);
        });

        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

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

        if (token && chatId) {
            let tgMessageId = '';
            if (fileUploads.length > 0) {
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('photo', new Blob([fileUploads[0].content], { type: fileUploads[0].contentType }), fileUploads[0].filename);
                formData.append('caption', messageText);
                formData.append('parse_mode', 'Markdown');
                formData.append('reply_markup', JSON.stringify(keyboard));

                const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: formData });
                const tgData = await tgRes.json();
                tgMessageId = tgData.result?.message_id?.toString() || '';
            } else {
                const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown', reply_markup: keyboard })
                });
                const tgData = await tgRes.json();
                tgMessageId = tgData.result?.message_id?.toString() || '';
            }
        }

        return res.status(200).json({ message: 'Success' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
