const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.RESEND_FROM || 'kaktuz <hello@kaktuz.ink>';
const WHATSAPP = () => process.env.ALENA_WHATSAPP || '';
const INSTAGRAM_URL = 'https://instagram.com/kaktuz_tattooz';

// ─── Shared HTML wrapper ────────────────────────────────────────────────
// Light luxury palette matching the site (linen background, ink text, gold accent).
// Uses system serif stacks — Google Fonts are unreliable across mail clients.
function wrap({ title, sub, body }) {
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : null;
  const year = new Date().getFullYear();

  // Thin botanical sprig — microrealism-inspired line art. SVG inlined as data URI
  // so it loads instantly without an external image host. Color tuned to ink-3.
  const branch = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 40' fill='none' stroke='%23b8956a' stroke-width='0.8' stroke-linecap='round'><path d='M10 20 Q60 20 120 20 Q180 20 230 20'/><path d='M40 20 Q42 14 48 12'/><path d='M40 20 Q38 26 32 28'/><path d='M70 20 Q72 13 79 11'/><path d='M70 20 Q68 27 61 29'/><path d='M100 20 Q103 12 111 10'/><path d='M100 20 Q97 28 89 30'/><path d='M130 20 Q132 13 139 11'/><path d='M130 20 Q128 27 121 29'/><path d='M160 20 Q163 12 171 10'/><path d='M160 20 Q157 28 149 30'/><path d='M190 20 Q192 14 198 12'/><path d='M190 20 Q188 26 182 28'/><ellipse cx='48' cy='10' rx='3' ry='1.5' transform='rotate(-25 48 10)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='32' cy='30' rx='3' ry='1.5' transform='rotate(25 32 30)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='80' cy='9' rx='3.2' ry='1.6' transform='rotate(-28 80 9)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='60' cy='30' rx='3.2' ry='1.6' transform='rotate(28 60 30)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='112' cy='8' rx='3.4' ry='1.7' transform='rotate(-28 112 8)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='88' cy='31' rx='3.4' ry='1.7' transform='rotate(28 88 31)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='140' cy='9' rx='3.2' ry='1.6' transform='rotate(-28 140 9)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='120' cy='30' rx='3.2' ry='1.6' transform='rotate(28 120 30)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='172' cy='8' rx='3.4' ry='1.7' transform='rotate(-28 172 8)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='148' cy='31' rx='3.4' ry='1.7' transform='rotate(28 148 31)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='198' cy='10' rx='3' ry='1.5' transform='rotate(-25 198 10)' fill='%23b8956a' fill-opacity='0.15'/><ellipse cx='182' cy='30' rx='3' ry='1.5' transform='rotate(25 182 30)' fill='%23b8956a' fill-opacity='0.15'/></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,400;1,9..144,500&family=Inter:wght@400;500&display=swap" rel="stylesheet"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1c1814;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#f5f0e8">
  <tr><td style="padding:32px 8px 8px;text-align:center">
    <img src="${branch}" alt="" width="200" height="34" style="display:inline-block;border:0;opacity:.85"/>
  </td></tr>

  <tr><td style="padding:8px 8px 32px;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:500;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8478">
    Dmytro Bilynets &nbsp;·&nbsp; kaktuz
  </td></tr>

  <tr><td style="border-top:1px solid rgba(28,24,20,.12);padding:0"></td></tr>

  <tr><td style="padding:40px 8px 8px">
    <h1 style="margin:0;font-family:'Fraunces','Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:400;font-size:34px;line-height:1.1;color:#1c1814;letter-spacing:-.005em">${title}</h1>
    ${sub ? `<p style="margin:12px 0 0;font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#4a4540">${sub}</p>` : ''}
  </td></tr>

  <tr><td style="padding:32px 8px 8px;border-top:1px solid rgba(28,24,20,.12);margin-top:32px"></td></tr>

  <tr><td style="padding:24px 8px 8px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:400;font-size:15px;line-height:1.75;color:#4a4540">
    ${body}
  </td></tr>

  <tr><td style="padding:40px 8px 0;border-top:1px solid rgba(28,24,20,.12);margin-top:40px"></td></tr>

  <tr><td style="padding:28px 8px 8px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.7;color:#8a8478">
    <p style="margin:0 0 8px;font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#4a4540">kaktuz · Den Haag</p>
    <p style="margin:0">
      <a href="${INSTAGRAM_URL}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:1px">@kaktuz_tattooz</a>
      ${waLink ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:1px">WhatsApp Alena</a>` : ''}
    </p>
  </td></tr>

  <tr><td style="padding:24px 8px 8px;text-align:center">
    <img src="${branch}" alt="" width="140" height="24" style="display:inline-block;border:0;opacity:.5"/>
  </td></tr>

  <tr><td style="padding:8px 8px 24px;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:400;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a8478;opacity:.6">
    © ${year} kaktuz · Private studio · By appointment only
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Reusable HTML components ───────────────────────────────────────────
function detailRow(label, value, gold = false) {
  return `<tr>
    <td style="padding:14px 0;border-bottom:1px solid rgba(28,24,20,.08);font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8a8478;width:40%">${label}</td>
    <td style="padding:14px 0;border-bottom:1px solid rgba(28,24,20,.08);font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:${gold ? '#b8956a' : '#1c1814'};text-align:right">${value}</td>
  </tr>`;
}

function detailCard(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;background:#ede8dc;border-left:2px solid #b8956a">
    <tr><td style="padding:8px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
  </table>`;
}

function primaryButton(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:14px 28px;background:#2d3d28;color:#f5f0e8;text-decoration:none;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;margin:8px 6px 8px 0">${text}</a>`;
}

function secondaryButton(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:14px 28px;background:transparent;color:#1c1814;border:1px solid rgba(28,24,20,.3);text-decoration:none;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;margin:8px 6px 8px 0">${text}</a>`;
}

// Calendar action block. Google Calendar gets a real clickable button.
// Apple Calendar gets a styled "outline" tile that visually matches Google's
// button but explains that the .ics attachment is the way to add the event —
// because Apple doesn't expose a webcal:// deep link API for ad-hoc events.
// Both tiles look like a pair: same height, icon, padding, typography.
function calendarButtons(googleUrl) {
  // 16×16 line-icons in linen (#f5f0e8) for the filled Google button
  // and in ink (#1c1814) for the outline Apple tile.
  const appleIcon  = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231c1814' stroke-width='1.4' stroke-linecap='round'><rect x='3' y='5' width='18' height='16' rx='2'/><line x1='3' y1='10' x2='21' y2='10'/><line x1='8' y1='3' x2='8' y2='7'/><line x1='16' y1='3' x2='16' y2='7'/><circle cx='12' cy='15.5' r='1.3' fill='%231c1814'/></svg>`;
  const googleIcon = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f5f0e8' stroke-width='1.4' stroke-linecap='round'><rect x='3' y='5' width='18' height='16' rx='2'/><line x1='3' y1='10' x2='21' y2='10'/><line x1='8' y1='3' x2='8' y2='7'/><line x1='16' y1='3' x2='16' y2='7'/><circle cx='12' cy='15.5' r='1.3' fill='%23f5f0e8'/></svg>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px">
    <tr>
      <td width="50%" valign="top" style="padding:0 6px 0 0">
        <div style="display:block;padding:16px 14px;background:#f5f0e8;border:1px solid rgba(28,24,20,.18);color:#1c1814;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:500;font-size:11px;letter-spacing:.18em;text-transform:uppercase">
          <img src="${appleIcon}" alt="" width="14" height="14" style="vertical-align:-2px;margin-right:8px;border:0"/>Apple Calendar
        </div>
      </td>
      <td width="50%" valign="top" style="padding:0 0 0 6px">
        <a href="${googleUrl}" style="display:block;padding:16px 14px;background:#2d3d28;color:#f5f0e8;text-decoration:none;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:500;font-size:11px;letter-spacing:.18em;text-transform:uppercase">
          <img src="${googleIcon}" alt="" width="14" height="14" style="vertical-align:-2px;margin-right:8px;border:0"/>Google Calendar
        </a>
      </td>
    </tr>
  </table>`;
}

function infoSection(label, items) {
  const list = items.map(i => `<li style="margin:0 0 10px;padding-left:4px">${i}</li>`).join('');
  return `<div style="margin:24px 0 16px">
    <p style="margin:0 0 12px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">${label}</p>
    <ul style="margin:0;padding-left:20px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:400;font-size:14px;line-height:1.75;color:#4a4540">${list}</ul>
  </div>`;
}

function noteCard(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#ede8dc;border-left:2px solid #b8956a">
    <tr><td style="padding:16px 20px;font-family:Georgia,serif;font-size:13px;line-height:1.75;color:#4a4540;font-style:italic">${text}</td></tr>
  </table>`;
}

// Clickable address card that opens in Google Maps / Apple Maps.
// We deliberately avoid <iframe> (blocked by all mail clients) and
// static map images (proxy/CDN issues, slow loads in Gmail).
// A clean card with the address + a clear "Open in Maps" CTA is the
// most reliable pattern across Gmail, Apple Mail, and Outlook.
function mapCard(address) {
  const isUrl = address && (address.startsWith('http://') || address.startsWith('https://'));
  const gmapsLink = isUrl ? address : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const displayAddress = isUrl ? 'kaktuz studio · Den Haag' : address;
  return `<a href="${gmapsLink}" style="display:block;margin:8px 0 24px;text-decoration:none;border:1px solid rgba(28,24,20,.12);background:#ede8dc">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:20px 24px" valign="middle">
          <p style="margin:0 0 4px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8a8478">Studio location</p>
          <p style="margin:0;font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#1c1814;line-height:1.4">${displayAddress}</p>
        </td>
        <td style="padding:20px 24px 20px 0;text-align:right;white-space:nowrap" valign="middle">
          <span style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8956a">Open in Maps →</span>
        </td>
      </tr>
    </table>
  </a>`;
}

// ─── Email #1: Enquiry confirmation ─────────────────────────────────────
async function sendEnquiryConfirmation({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Your enquiry has been received · Dmytro Bilynets',
    html: wrap({
      title: "We've got your enquiry.",
      sub: `Thank you, ${name}.`,
      body: `
        <p style="margin:0 0 20px">Your booking request has just landed. Dmytro reviews every enquiry personally before responding — we'll be in touch within <span style="color:#b8956a">48 hours</span> with next steps or further questions.</p>
        <p style="margin:0 0 24px">In the meantime, feel free to browse more of his recent work on Instagram.</p>
        <p style="margin:24px 0 0"><a href="${INSTAGRAM_URL}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:2px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase">View on Instagram →</a></p>
      `
    })
  });
}

// ─── Email #2: Polite rejection ────────────────────────────────────────
async function sendRejectionEmail({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Regarding your enquiry · Dmytro Bilynets',
    html: wrap({
      title: 'Thank you for reaching out.',
      sub: `A note for ${name}.`,
      body: `
        <p style="margin:0 0 20px">We sincerely appreciate your interest in working with Dmytro. After careful consideration, we're sorry to let you know that we're unable to take on your project at this time.</p>
        <p style="margin:0 0 20px">This may be due to the current schedule, the style of work requested, or simply the timing — it does not reflect on you or your idea.</p>
        <p style="margin:0 0 24px">We wish you all the best in bringing your vision to life with the right artist.</p>
        <p style="margin:32px 0 0;font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#4a4540">With warmth — kaktuz team.</p>
      `
    })
  });
}

// ─── Email #3a: Deposit received (date TBC) ─────────────────────────────
async function sendDepositConfirmation({ name, email }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: 'Deposit received · Your spot is secured',
    html: wrap({
      title: 'Your spot is secured.',
      sub: `Thank you, ${name}.`,
      body: `
        ${detailCard(
          detailRow('Deposit', '€50') +
          detailRow('Artist', 'Dmytro Bilynets') +
          detailRow('Studio', 'kaktuz · Den Haag') +
          detailRow('Date', 'To be confirmed', true)
        )}
        <p style="margin:0 0 20px">Your €50 deposit has been received and your slot is held. Alena will reach out personally to confirm the exact date and time of your session.</p>
        <p style="margin:0 0 24px">Once the date is set, you'll receive a separate confirmation with calendar invite and full studio details.</p>
        <p style="margin:32px 0 0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8a8478">The deposit is deducted from the final price. Non-refundable in case of cancellation within 48 hours of the session.</p>
      `
    })
  });
}

// ─── Email #3b: Appointment confirmed with .ics + full details ──────────
async function sendAppointmentCalendar({ name, email, sessionDate, address, icsContent, googleUrl }) {
  const resend = getResend();

  const startDate = new Date(sessionDate);
  const weekday = startDate.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/Amsterdam' });
  const fullDate = startDate.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
  });

  const studioAddress = address || process.env.STUDIO_ADDRESS || 'Address provided by Alena';
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;

  return resend.emails.send({
    from: FROM(),
    to: email,
    subject: `Your appointment is confirmed · ${weekday}`,
    html: wrap({
      title: `See you on ${weekday}.`,
      sub: `Appointment confirmed, ${name}.`,
      body: `
        ${detailCard(
          detailRow('Date & Time', fullDate, true) +
          detailRow('Duration', '~3 hours') +
          detailRow('Artist', 'Dmytro Bilynets') +
          detailRow('Studio', 'kaktuz') +
          detailRow('Address', studioAddress)
        )}

        <p style="margin:24px 0 8px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:500;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">Add to your calendar</p>
        ${calendarButtons(googleUrl)}
        <p style="margin:8px 0 24px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a8478;text-align:center">On iPhone or Mac, tap the attached <strong style="color:#4a4540;font-weight:500">appointment.ics</strong> to add it instantly.</p>

        <p style="margin:24px 0 12px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">Arriving at the studio</p>
        ${mapCard(studioAddress)}
        <p style="margin:0 0 16px">The studio is private and by appointment only. Please ring the bell at the entrance and Dmytro will let you in.</p>
        <p style="margin:0 0 24px"><strong>Please arrive 5 minutes early</strong> so we can settle in without rushing.</p>

        ${noteCard(`Any questions before your session? Reach Alena via <a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4)">WhatsApp</a>.`)}
      `
    }),
    attachments: [
      {
        filename: 'appointment.ics',
        content: Buffer.from(icsContent).toString('base64')
      }
    ]
  });
}

// ─── Email #4: Pre-care (7 days before session) ─────────────────────────
async function sendPreCareEmail({ name, email, sessionDate, address }, { idempotencyKey } = {}) {
  const resend = getResend();
  const studioAddress = address || process.env.STUDIO_ADDRESS || 'Address shared in your confirmation email';
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;

  const payload = {
    from: FROM(),
    to: email,
    subject: 'Preparing for your session · One week to go',
    html: wrap({
      title: 'One week to go.',
      sub: `Quick prep notes, ${name}.`,
      body: `
        <p style="margin:0 0 24px">Your session with Dmytro is in a week. Here's how to prepare so everything goes smoothly.</p>

        ${infoSection('In the days leading up', [
          '<strong>Sleep & nutrition.</strong> Get a good night\'s sleep before the session. Eat a proper meal beforehand — long sessions are easier with stable blood sugar.',
          '<strong>No alcohol for 24 hours.</strong> It thins the blood and affects healing.',
          '<strong>Avoid sun & tanning beds.</strong> Tattooing freshly tanned or burnt skin doesn\'t work well. Stay covered.',
          '<strong>No creams or lotions</strong> on the area 24 hours before.',
          '<strong>Skip coffee</strong> on the day if you can — it can make you jittery during long sessions.'
        ])}

        ${infoSection('What to bring', [
          'ID / passport',
          'Remaining balance — payment method confirmed with Alena',
          'A snack & water if your session is over 2 hours',
          'Comfortable, loose clothing that gives access to the tattoo area'
        ])}

        ${infoSection('Logistics', [
          `<strong>Address:</strong> ${studioAddress}`,
          'Private studio — ring the bell, Dmytro will let you in',
          'Arrive 5 minutes early'
        ])}

        ${mapCard(studioAddress)}

        ${noteCard(`Need to reschedule? Let Alena know <strong>at least 48 hours in advance</strong> — deposits are non-refundable within 48 hours of the session.`)}

        <p style="margin:24px 0 0"><a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:2px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase">Message Alena →</a></p>
      `
    })
  };

  return idempotencyKey
    ? resend.emails.send(payload, { idempotencyKey })
    : resend.emails.send(payload);
}

// ─── Email #5: Aftercare (3 days after session) ─────────────────────────
async function sendAftercareEmail({ name, email }, { idempotencyKey } = {}) {
  const resend = getResend();
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;

  const payload = {
    from: FROM(),
    to: email,
    subject: 'Aftercare reminder · Your tattoo by Dmytro',
    html: wrap({
      title: 'How is it healing?',
      sub: `Aftercare guide for ${name}.`,
      body: `
        <p style="margin:0 0 24px">A few days have passed since your session. Here's a reminder of the key aftercare steps to keep your tattoo looking its best for years to come.</p>

        ${infoSection('Days 1–3', [
          'Keep the area clean — gently wash 2× a day with lukewarm water and fragrance-free soap',
          'Apply a thin layer of unscented healing cream (Bepanthen, Aquaphor, or similar) 2–3 times a day',
          'Don\'t pick, scratch, or rub'
        ])}

        ${infoSection('Days 4–14', [
          'Peeling and itching are normal — never force the peel',
          'Continue light moisturising',
          '<strong>No swimming, baths, saunas, or sea water</strong>',
          'Keep out of direct sunlight'
        ])}

        ${infoSection('Month 1 onwards', [
          'Use <strong>SPF 50+</strong> on the tattoo whenever it\'s exposed to sun',
          'This is the single most important thing for long-term ink longevity'
        ])}

        ${noteCard(`If you notice anything unusual — excessive redness, swelling, or weeping after day 3 — message Alena immediately. We're here.`)}

        <p style="margin:24px 0 8px">We'd love to see the healed result. Tag <a href="${INSTAGRAM_URL}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4)"><strong>@kaktuz_tattooz</strong></a> on Instagram.</p>
        <p style="margin:24px 0 0"><a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:2px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase">Message Alena →</a></p>
      `
    })
  };

  return idempotencyKey
    ? resend.emails.send(payload, { idempotencyKey })
    : resend.emails.send(payload);
}

module.exports = {
  sendEnquiryConfirmation,
  sendRejectionEmail,
  sendDepositConfirmation,
  sendAppointmentCalendar,
  sendPreCareEmail,
  sendAftercareEmail
};
