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
        const { name, email, instagram, idea, size, placement, budget, notes } = fields;
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

💡 *Idea:* ${idea}
📏 *Size:* ${size}
📍 *Placement:* ${placement}
💰 *Budget:* ${budget}

📝 *Notes:* ${notes || 'None'}
        `;

        // 1. Send the text details
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        });

        // 2. Send files if any
        for (const f of files) {
          const formData = new FormData();
          formData.append('chat_id', chatId);
          
          // Convert buffer to Blob for fetch
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
