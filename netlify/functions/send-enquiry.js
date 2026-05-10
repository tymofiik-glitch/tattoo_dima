const Busboy = require('busboy');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  return new Promise((resolve) => {
    const busboy = Busboy({ headers: event.headers });
    const fields = {};
    const files = [];

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        files.push({
          name,
          filename,
          mimeType,
          content: Buffer.concat(chunks)
        });
      });
    });

    busboy.on('finish', async () => {
      try {
        const { name, email, instagram, phone, idea, size, placement, budget, notes } = fields;
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
          resolve({ statusCode: 500, body: 'Server configuration error' });
          return;
        }

        const message = `
🔥 *New Tattoo Enquiry*

👤 *Client:* ${name}
📧 *Email:* ${email}
📸 *Instagram:* ${instagram}
📱 *Phone:* ${phone}

💡 *Idea:* ${idea}
📏 *Size:* ${size}
📍 *Placement:* ${placement}
💰 *Budget:* ${budget}

📝 *Notes:* ${notes || 'None'}
        `;

        // 1. Send the text details with buttons
        const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: "💬 Начать чат", callback_data: `chat|${cleanPhone}|${name.substring(0, 20)}` },
              { text: "❌ Отклонить", callback_data: `reject` }
            ]
          ]
        };

        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
          })
        });
        const tgData = await tgRes.json();
        const tgMessageId = tgData.result?.message_id?.toString() || '';

        // 2. Save to Airtable
        const airtableToken = process.env.AIRTABLE_TOKEN;
        const airtableBase = process.env.AIRTABLE_BASE_ID;
        if (airtableToken && airtableBase) {
          const sizeMap = { xs: 'XS — under 5cm', s: 'S — 5–10cm', m: 'M — 10–15cm', l: 'L — 15cm+' };
          const budgetMap = { '150-300': '€150-300', '300-500': '€300-500', '500+': '€500+' };
          await fetch(`https://api.airtable.com/v0/${airtableBase}/Enquiries`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${airtableToken}`
            },
            body: JSON.stringify({
              fields: {
                Name: name || '',
                Email: email || '',
                Instagram: instagram || '',
                Phone: phone || '',
                Idea: idea || '',
                Size: sizeMap[size] || size || '',
                Placement: placement || '',
                Budget: budgetMap[budget] || budget || '',
                Notes: notes || '',
                Status: '🆕 New',
                'Telegram Message ID': tgMessageId
              }
            })
          });
        }

        // 3. Send files if any
        for (const f of files) {
          const formData = new FormData();
          formData.append('chat_id', chatId);
          
          const blob = new Blob([f.content], { type: f.mimeType });
          formData.append('photo', blob, f.filename);

          await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: 'POST',
            body: formData
          });
        }

        resolve({
          statusCode: 200,
          body: JSON.stringify({ message: 'Success' })
        });
      } catch (error) {
        console.error('Error:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to process enquiry' })
        });
      }
    });

    busboy.on('error', (err) => {
      console.error('Busboy error:', err);
      resolve({ statusCode: 500, body: 'Error parsing form' });
    });

    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    busboy.end(body);
  });
};
