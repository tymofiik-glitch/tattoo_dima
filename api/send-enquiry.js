const Busboy = require('busboy');

module.exports = async (req, res) => {
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
👤 *CLIENT:* ${fields.name || 'N/A'}
📧 *EMAIL:* ${fields.email || 'N/A'}
📸 *IG:* ${fields.instagram || 'N/A'}
📞 *PHONE:* ${fields.phone || 'N/A'}

🖼️ *TATTOO DETAILS*
📐 *SIZE:* ${displaySize}
📍 *PLACE:* ${fields.placement || 'N/A'}
💰 *BUDGET:* ${displayBudget}

📝 *IDEA:*
${fields.idea || 'N/A'}

📓 *NOTES:*
${fields.notes || 'None'}
━━━━━━━━━━━━━━━━━━
        `.trim();

        const keyboard = {
            inline_keyboard: [[
                { text: '💬 Start Chat', callback_data: `chat|${fields.phone || '0'}|${fields.name || 'Client'}` },
                { text: '❌ Reject', callback_data: 'reject' }
            ]]
        };

        // Send to Telegram
        if (fileUploads.length > 0) {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('photo', new Blob([fileUploads[0].content], { type: fileUploads[0].contentType }), fileUploads[0].filename);
            formData.append('caption', messageText);
            formData.append('parse_mode', 'Markdown');
            formData.append('reply_markup', JSON.stringify(keyboard));

            await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: formData });
        } else {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown', reply_markup: keyboard })
            });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('SERVER ERROR:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
