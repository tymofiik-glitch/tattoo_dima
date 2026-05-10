// Helper: parse a field value from the Telegram message text
function parseField(text, label) {
  const regex = new RegExp(label + ':\\s*(.+)');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const resendKey = process.env.RESEND_API_KEY;

    if (body.callback_query) {
      const { id, data, message } = body.callback_query;
      const chatId = message.chat.id;
      const messageId = message.message_id;
      const originalText = message.text;

      // Always answer the callback query first to remove loading state
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: id })
      });

      // --- CHAT BUTTON ---
      if (data.startsWith('chat|')) {
        const [_, phone, name] = data.split('|');
        const waLink = `https://wa.me/${phone}`;

        // Send WhatsApp link to manager
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔗 [Написать ${name} в WhatsApp](${waLink})`,
            parse_mode: 'Markdown'
          })
        });

        // Evolve buttons: Chat → Deposit
        const updatedKeyboard = {
          inline_keyboard: [[
            { text: '💳 Сгенерировать депозит', callback_data: `deposit|${phone}|${name}` },
            { text: '❌ Отклонить', callback_data: 'reject' }
          ]]
        };

        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: updatedKeyboard })
        });

      // --- REJECT BUTTON ---
      } else if (data === 'reject') {
        // Extract client data from the original message text
        const clientEmail = parseField(originalText, 'Email');
        const clientName  = parseField(originalText, 'Client');

        // 1. Update the Telegram message to mark as rejected
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: originalText + '\n\n❌ Заявка отклонена. Письмо клиенту отправлено.',
          })
        });

        // 2. Send polite rejection email via Resend
        if (resendKey && clientEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendKey}`
            },
            body: JSON.stringify({
              from: 'The Muse Ink <noreply@themuseink.com>',
              to: clientEmail,
              subject: 'Your enquiry at The Muse Ink',
              html: `
                <div style="font-family:'Georgia',serif;max-width:540px;margin:0 auto;color:#1c1814;padding:40px 24px;">
                  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8478;margin-bottom:32px;">The Muse Ink · Den Haag</p>
                  <h2 style="font-style:italic;font-weight:300;font-size:26px;margin-bottom:24px;">Dear ${clientName || 'there'},</h2>
                  <p style="line-height:1.85;color:#4a4540;">Thank you so much for reaching out and for your interest in working with us. We have carefully reviewed your enquiry and, unfortunately, we won't be able to take it on at this time.</p>
                  <p style="line-height:1.85;color:#4a4540;">This can happen for a variety of reasons — timing, style fit, or a full calendar — and it is in no way a reflection of your idea.</p>
                  <p style="line-height:1.85;color:#4a4540;">We sincerely wish you all the best in finding the right artist for your piece.</p>
                  <p style="margin-top:40px;line-height:1.85;color:#4a4540;">Warmly,<br/><strong style="font-style:italic;">Dmytro Bilynets</strong><br/><span style="font-size:12px;color:#8a8478;">The Muse Ink</span></p>
                  <div style="margin-top:40px;padding-top:24px;border-top:1px solid #e4dbd0;font-size:11px;color:#8a8478;">
                    <a href="https://instagram.com/kaktuz_tattooz" style="color:#b8956a;text-decoration:none;">@kaktuz_tattooz</a>
                  </div>
                </div>
              `
            })
          });
        }

      // --- DEPOSIT BUTTON ---
      } else if (data.startsWith('deposit|')) {
        const [_, phone, name] = data.split('|');
        // Placeholder — will be replaced with Mollie API integration
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `💳 Ссылка на депозит для ${name} (50€):\nhttps://themuseink.com/deposit?client=${encodeURIComponent(name)}`
          })
        });
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
