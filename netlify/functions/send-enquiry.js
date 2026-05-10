exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { name, email, instagram, idea, size, placement, budget, notes } = data;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.error('Missing Telegram configuration');
      return { statusCode: 500, body: 'Server configuration error' };
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

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Success' })
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send enquiry' })
    };
  }
};
