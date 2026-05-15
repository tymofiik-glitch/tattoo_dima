const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.RESEND_FROM || 'The Muse Ink <onboarding@resend.dev>';

// Shared HTML wrapper — dark luxury style matching the site
function wrap(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
  body{margin:0;padding:0;background:#0d0b07;font-family:'Georgia',serif;color:#f5f0e8}
  .wrap{max-width:520px;margin:0 auto;padding:48px 32px}
  .logo{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:rgba(245,240,232,.4);margin-bottom:40px}
  .rule{border:none;border-top:.5px solid rgba(245,240,232,.1);margin:32px 0}
  h1{font-size:32px;font-style:italic;font-weight:400;line-height:1.1;color:#f5f0e8;margin:0 0 8px}
  .sub{font-size:13px;color:rgba(245,240,232,.45);margin:0 0 32px;font-style:italic}
  p{font-size:14px;line-height:1.85;color:rgba(245,240,232,.7);margin:0 0 20px}
  .highlight{color:#b8956a}
  .btn{display:inline-block;padding:14px 28px;background:#2d3d28;color:#f5f0e8;text-decoration:none;font-family:'Arial',sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;margin:8px 0}
  .footer{margin-top:48px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(245,240,232,.2)}
  .detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:.5px solid rgba(245,240,232,.08);font-size:13px}
  .detail-label{color:rgba(245,240,232,.35);letter-spacing:.1em;text-transform:uppercase;font-size:10px;font-family:'Arial',sans-serif}
  .detail-value{color:rgba(245,240,232,.8);font-style:italic}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Dmytro Bilynets · The Muse Ink · Den Haag</div>
  ${body}
  <div class="footer">© The Muse Ink · Regentessekwartier, Den Haag</div>
</div>
</body>
</html>`;
}

// Email #1 — Enquiry confirmation to client
async function sendEnquiryConfirmation({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Your enquiry has been received · Dmytro Bilynets',
    html: wrap(`
      <h1>We've got your enquiry.</h1>
      <p class="sub">Thank you, ${name}.</p>
      <hr class="rule"/>
      <p>Your booking request has been received and is now being reviewed. We'll be in touch within <span class="highlight">48 hours</span> with next steps.</p>
      <p>In the meantime, feel free to browse more of Dmytro's work on Instagram.</p>
      <hr class="rule"/>
      <p style="font-size:12px;color:rgba(245,240,232,.3)">If you have any questions, simply reply to this email.</p>
    `)
  });
}

// Email #2 — Rejection (polite decline)
async function sendRejectionEmail({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Regarding your enquiry · Dmytro Bilynets',
    html: wrap(`
      <h1>Thank you for reaching out.</h1>
      <p class="sub">A note for ${name}.</p>
      <hr class="rule"/>
      <p>We sincerely appreciate your interest in booking with Dmytro. After careful consideration, we're sorry to let you know that we're unable to take on your project at this time.</p>
      <p>This may be due to the current schedule, the style of work requested, or simply the timing — it is not a reflection of your idea.</p>
      <p>We wish you all the best in finding the right artist for your vision.</p>
      <hr class="rule"/>
      <p style="font-size:12px;color:rgba(245,240,232,.3)">With kindness — The Muse Ink team.</p>
    `)
  });
}

// Email #3a — Deposit received (no date yet)
async function sendDepositConfirmation({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Deposit received · Your spot is secured',
    html: wrap(`
      <h1>Your spot is secured.</h1>
      <p class="sub">Thank you, ${name}.</p>
      <hr class="rule"/>
      <div>
        <div class="detail-row"><span class="detail-label">Deposit</span><span class="detail-value">€50</span></div>
        <div class="detail-row"><span class="detail-label">Artist</span><span class="detail-value">Dmytro Bilynets</span></div>
        <div class="detail-row"><span class="detail-label">Studio</span><span class="detail-value">The Muse Ink · Den Haag</span></div>
        <div class="detail-row" style="border-bottom:none"><span class="detail-label">Date</span><span class="detail-value">To be confirmed</span></div>
      </div>
      <hr class="rule"/>
      <p>Your €50 deposit has been received. Alena will reach out shortly to confirm the exact date and time of your session.</p>
      <p style="font-size:12px;color:rgba(245,240,232,.3)">The deposit is deducted from the final price and is non-refundable in case of cancellation within 48 hours of the session.</p>
    `)
  });
}

// Email #3b — Appointment confirmed with .ics attachment and Google Calendar link
async function sendAppointmentCalendar({ name, email, sessionDate, icsContent, googleUrl }) {
  const resend = getResend();

  const dateStr = new Date(sessionDate).toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
  });

  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Your appointment is confirmed · Dmytro Bilynets',
    html: wrap(`
      <h1>See you soon.</h1>
      <p class="sub">Appointment confirmed, ${name}.</p>
      <hr class="rule"/>
      <div>
        <div class="detail-row"><span class="detail-label">Date & Time</span><span class="detail-value">${dateStr}</span></div>
        <div class="detail-row"><span class="detail-label">Artist</span><span class="detail-value">Dmytro Bilynets</span></div>
        <div class="detail-row" style="border-bottom:none"><span class="detail-label">Studio</span><span class="detail-value">Regentessekwartier, Den Haag</span></div>
      </div>
      <hr class="rule"/>
      <p>Your session is confirmed. Add it to your calendar so you don't forget:</p>
      <a href="${googleUrl}" class="btn">Add to Google Calendar</a>
      <p style="margin-top:16px;font-size:13px;color:rgba(245,240,232,.4)">Or open the attached <strong style="color:rgba(245,240,232,.6)">.ics file</strong> to add it to Apple Calendar in one click.</p>
      <hr class="rule"/>
      <p style="font-size:12px;color:rgba(245,240,232,.3)">Please arrive a few minutes early. If you need to reschedule, contact Alena at least 48 hours in advance.</p>
    `),
    attachments: [
      {
        filename: 'appointment.ics',
        content: Buffer.from(icsContent).toString('base64'),
      }
    ]
  });
}

// Email #4 — Aftercare instructions (sent 3 days after session)
async function sendAftercareEmail({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Aftercare reminder · Your tattoo by Dmytro',
    html: wrap(`
      <h1>How is it healing?</h1>
      <p class="sub">Aftercare guide for ${name}.</p>
      <hr class="rule"/>
      <p>It's been a few days since your session — here's a quick reminder of the most important aftercare steps to keep your tattoo looking its best.</p>
      <div style="margin:24px 0">
        <p><span class="highlight">Days 1–3</span><br/>Keep the area clean and lightly moisturised. Use a thin layer of unscented cream (Bepanthen or similar) 2–3 times a day. Avoid picking or scratching.</p>
        <p><span class="highlight">Days 4–14</span><br/>Peeling is normal — do not force it. Continue moisturising. Avoid soaking in water (no pools, baths, or sea). Keep out of direct sunlight.</p>
        <p><span class="highlight">Month 1+</span><br/>Apply SPF 50+ sunscreen whenever the tattoo is exposed to the sun. This protects the ink long-term.</p>
      </div>
      <hr class="rule"/>
      <p>If you have any concerns — redness, swelling, or anything unexpected — don't hesitate to reach out. We're always happy to help.</p>
      <p style="font-size:12px;color:rgba(245,240,232,.3)">Thank you for trusting Dmytro with your skin. We'd love to see the healed result — tag us on Instagram.</p>
    `)
  });
}

module.exports = {
  sendEnquiryConfirmation,
  sendRejectionEmail,
  sendDepositConfirmation,
  sendAppointmentCalendar,
  sendAftercareEmail
};
