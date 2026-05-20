const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Resend SDK returns { data, error } instead of throwing on API errors,
// which made every email call here look successful even when the key was
// invalid or the request was rejected. Wrap every send in this guard so
// failures propagate to callers (cron, webhooks) that have their own
// error-handling and alerting.
async function safeSend(resend, payload, options) {
  const result = options
    ? await resend.emails.send(payload, options)
    : await resend.emails.send(payload);
  if (result?.error) {
    const e = result.error;
    const err = new Error(`Resend ${e.statusCode || ''} ${e.name || ''}: ${e.message || 'unknown'}`.trim());
    err.resend = e;
    throw err;
  }
  return result;
}

const FROM = () => 'DMYTRO BILYNETS · the muse ink <hello@kaktuz.ink>';
const WHATSAPP = () => process.env.ALENA_WHATSAPP || '';
const INSTAGRAM_URL = 'https://instagram.com/kaktuz_tattooz';

// ─── Shared HTML wrapper ────────────────────────────────────────────────
// Light luxury palette matching the site (linen background, ink text, gold accent).
// Uses system serif stacks — Google Fonts are unreliable across mail clients.
function wrap({ title, sub, body }) {
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : null;
  const year = new Date().getFullYear();

  // Minimal botanical divider — Gmail blocks SVG (both inline data-URI and
  // <img>), so we render the ornament with plain HTML: a thin gold rule with
  // a small diamond glyph in the middle. Works in Gmail, Apple Mail, iCloud,
  // Outlook web + desktop, and falls back gracefully in plain-text clients.
  const ornament = (width = 200) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;width:${width}px">
      <tr>
        <td style="height:1px;border-bottom:1px solid #b8956a;opacity:.6">&nbsp;</td>
        <td style="padding:0 12px;font-family:Georgia,serif;font-size:14px;color:#b8956a;opacity:.7;line-height:1">&#10070;</td>
        <td style="height:1px;border-bottom:1px solid #b8956a;opacity:.6">&nbsp;</td>
      </tr>
    </table>`;

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
<div style="display:none;font-size:1px;color:#f5f0e8;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${sub}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#f5f0e8">
  <tr><td style="padding:32px 8px 8px;text-align:center">
    ${ornament(200)}
  </td></tr>

  <tr><td style="padding:8px 8px 32px;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:500;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a8478">
    Dmytro Bilynets &nbsp;·&nbsp; the muse ink
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
    <p style="margin:0 0 8px;font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#4a4540">the muse ink · Den Haag</p>
    <p style="margin:0">
      <a href="${INSTAGRAM_URL}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:1px">@kaktuz_tattooz</a>
      ${waLink ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:1px">WhatsApp Alena</a>` : ''}
    </p>
  </td></tr>

  <tr><td style="padding:24px 8px 8px;text-align:center">
    ${ornament(140)}
  </td></tr>

  <tr><td style="padding:8px 8px 24px;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:400;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a8478;opacity:.6">
    © ${year} the muse ink · Private studio · By appointment only
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

// Single Google Calendar button. Apple users add the event via the .ics
// attachment at the bottom of the email — no separate button needed,
// since Apple Mail / iOS auto-detect the attachment and surface a native
// "Add to Calendar" affordance. The old Apple tile was a dead placeholder.
function calendarButtons(googleUrl) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0">
    <tr>
      <td align="center" style="padding:0">
        <a href="${googleUrl}" style="display:inline-block;padding:14px 32px;background:#2d3d28;color:#f5f0e8;text-decoration:none;text-align:center;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:500;font-size:11px;letter-spacing:.22em;text-transform:uppercase">
          Add to Google Calendar
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
  const displayAddress = isUrl ? 'the muse ink studio · Den Haag' : address;
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
  return safeSend(resend, {
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
  return safeSend(resend, {
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
        <p style="margin:32px 0 0;font-family:'Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#4a4540">With warmth — the muse ink team.</p>
      `
    })
  });
}

// ─── Email #3a: Deposit received (date TBC) ─────────────────────────────
async function sendDepositConfirmation({ name, email }) {
  const resend = getResend();
  return safeSend(resend, {
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
          detailRow('Studio', 'the muse ink · Den Haag') +
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

  return safeSend(resend, {
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
          detailRow('Studio', 'the muse ink') +
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

  return safeSend(resend, payload, idempotencyKey ? { idempotencyKey } : undefined);
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

  return safeSend(resend, payload, idempotencyKey ? { idempotencyKey } : undefined);
}

module.exports = {
  sendEnquiryConfirmation,
  sendRejectionEmail,
  sendDepositConfirmation,
  sendAppointmentCalendar,
  sendPreCareEmail,
  sendAftercareEmail
};
