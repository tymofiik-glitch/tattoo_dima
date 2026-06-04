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

const FROM = () => 'DMYTRO BILYNETS · the muse ink <noreply@kaktuz.ink>';
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
  // inline-block span with border-bottom inside a vertical-align:middle td.
  // Inline elements ARE centred by vertical-align:middle in both Gmail and
  // iCloud Mail. With height:0 the border sits exactly at the row's midpoint.
  const ornamentLine = `<span style="display:inline-block;width:100%;height:0;border-bottom:1px solid #c8a87a;font-size:0;line-height:0">​</span>`;
  const ornament = (width = 200) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;width:${width}px">
      <tr>
        <td style="padding:0;vertical-align:middle">${ornamentLine}</td>
        <td style="padding:0 11px;white-space:nowrap;font-family:Georgia,serif;font-size:13px;color:#b8956a;vertical-align:middle;line-height:1">&#10070;</td>
        <td style="padding:0;vertical-align:middle">${ornamentLine}</td>
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
      ${waLink ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:1px">WhatsApp</a>` : ''}
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
    <td style="padding:14px 0;border-bottom:1px solid rgba(28,24,20,.08);font-family:Didot,'Didot LT STD','Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:${gold ? '#b8956a' : '#1c1814'};text-align:right">${value}</td>
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

function warningCard(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:#fff5f5;border-left:3px solid #d93838">
    <tr><td style="padding:16px 20px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.75;color:#b32424">${text}</td></tr>
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
          <p style="margin:0;font-family:Didot,'Didot LT STD','Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#1c1814;line-height:1.4">${displayAddress}</p>
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
        <p style="margin:0 0 20px">Every design is created <strong>live in the studio during your session</strong> — no need to prepare a sketch, just bring your idea and reference images if you have them.</p>
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
        <p style="margin:32px 0 0;font-family:Didot,'Didot LT STD','Fraunces','Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#4a4540">With warmth — the muse ink team.</p>
      `
    })
  });
}

// ─── Email #3: Booking confirmation (deposit + date + calendar) ─────────
// Sent immediately after deposit payment. If sessionDate is provided the
// email includes the confirmed date, a Google Calendar button, and an .ics
// attachment. If no date yet (edge-case), the date row shows "To be confirmed".
async function sendBookingConfirmation({ name, email, sessionDate, address, icsContent, googleUrl }) {
  const resend = getResend();
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;
  const studioAddress = address || process.env.STUDIO_ADDRESS || 'Shared before your session';

  let subject, heroTitle, heroSub, dateSection, attachments;

  if (sessionDate) {
    const d = new Date(sessionDate);
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/Amsterdam' });
    const fullDate = d.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
    });
    subject  = `Your session is confirmed · ${weekday}`;
    heroTitle = `You're booked.`;
    heroSub   = `Session confirmed, ${name}.`;
    dateSection = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;background:#ede8dc;border-left:3px solid #b8956a">
        <tr>
          <td bgcolor="#ede8dc" style="background-color:#ede8dc;padding:18px 22px">
            <p style="margin:0 0 5px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:.26em;text-transform:uppercase;color:#8a8478">Your session</p>
            <p style="margin:0;font-family:Didot,'Didot LT STD','Fraunces',Georgia,serif;font-style:italic;font-size:22px;line-height:1.3;color:#1c1814">${fullDate}</p>
          </td>
        </tr>
      </table>`;
    attachments = [{ filename: 'appointment.ics', content: Buffer.from(icsContent).toString('base64') }];
  } else {
    subject   = 'Deposit received · Your spot is secured';
    heroTitle = 'Your spot is secured.';
    heroSub   = `Deposit confirmed, ${name}.`;
    dateSection = '';
    attachments = [];
  }

  const calendarSection = sessionDate && googleUrl ? `
    <p style="margin:24px 0 8px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;
              font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">Add to your calendar</p>
    ${calendarButtons(googleUrl)}
    <p style="margin:8px 0 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;
              font-size:12px;line-height:1.6;color:#8a8478;text-align:center">
      On iPhone or Mac, tap the attached
      <strong style="color:#4a4540;font-weight:500">appointment.ics</strong>
      to add it instantly.
    </p>` : '';

  const arrivalSection = sessionDate ? `
    <p style="margin:28px 0 10px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;
              font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">Finding the studio</p>
    ${mapCard(studioAddress)}
    <p style="margin:0 0 8px">When you arrive, please feel free to walk right in and make yourself comfortable.</p>
    <p style="margin:0 0 24px"><strong>Please arrive on time</strong>
      so we can begin the session as scheduled.</p>` : `
    <p style="margin:0 0 24px">Our manager will be in touch to confirm your exact date and time.
      Once confirmed, you'll receive full studio details and a calendar invite.</p>`;

  return safeSend(resend, {
    from: FROM(),
    to: email,
    subject,
    html: wrap({
      title: heroTitle,
      sub: heroSub,
      body: `
        ${dateSection}
        ${detailCard(
          detailRow('Deposit', '€50 — Paid', true) +
          detailRow('Artist', 'Dmytro Bilynets') +
          detailRow('Studio', 'the muse ink · Den Haag')
        )}
        ${calendarSection}
        ${arrivalSection}
        ${sessionDate ? `
        <p style="margin:28px 0 10px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;
                  font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">Free parking nearby</p>
        <p style="margin:0 0 10px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.7;color:#4a4540">
          The street where the studio is located has free parking all the way to the roundabout.
          Parking at the roundabout is paid, but you can usually find a free spot within 50–100 metres.
          <strong>Free parking until 18:00.</strong>
        </p>
        <img src="https://raw.githubusercontent.com/tymofiik-glitch/tattoo_dima/main/img/parking-map.jpg"
             alt="Free parking map" width="480"
             style="width:100%;max-width:480px;height:auto;display:block;margin:0 0 24px;border-radius:4px"/>` : ''}
        <p style="margin:0 0 16px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.7;color:#8a8478;font-style:italic">
          Every design is created live in the studio during your session — no need to prepare a sketch.
        </p>
        ${noteCard(`Questions before your session? Message us via <a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4)">WhatsApp</a>.`)}
        <p style="margin:28px 0 0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;
                  font-size:11px;line-height:1.7;color:#8a8478">
          The deposit is deducted from the final price.
          Non-refundable if cancelled within 48 hours of the session.
        </p>
      `
    }),
    attachments
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
          'Remaining balance — payment method confirmed with the studio',
          'A snack & water if your session is over 2 hours',
          'Comfortable, loose clothing that gives access to the tattoo area'
        ])}

        ${infoSection('Logistics', [
          `<strong>Address:</strong> ${studioAddress}`,
          'Private studio — walk right in and make yourself comfortable.',
          'Arrive on time'
        ])}

        ${mapCard(studioAddress)}

        <p style="margin:28px 0 10px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;
                  font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#b8956a">Free parking nearby</p>
        <p style="margin:0 0 10px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.7;color:#4a4540">
          The street where the studio is located has free parking all the way to the roundabout.
          Parking at the roundabout is paid, but you can usually find a free spot within 50–100 metres.
          <strong>Free parking until 18:00.</strong>
        </p>
        <img src="https://raw.githubusercontent.com/tymofiik-glitch/tattoo_dima/main/img/parking-map.jpg"
             alt="Free parking map" width="480"
             style="width:100%;max-width:480px;height:auto;display:block;margin:0 0 24px;border-radius:4px"/>

        ${noteCard(`Need to reschedule? Let us know <strong>at least 48 hours in advance</strong> — deposits are non-refundable within 48 hours of the session.`)}

        <p style="margin:24px 0 0"><a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:2px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase">Contact the studio →</a></p>
      `
    })
  };

  return safeSend(resend, payload, idempotencyKey ? { idempotencyKey } : undefined);
}

// ─── Email #5: Aftercare (same day of session) ─────────────────────────
async function sendAftercareEmail({ name, email, photos = [] }, { idempotencyKey } = {}) {
  const resend = getResend();
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;

  const attachments = photos.map((buf, i) => ({
    filename: `tattoo-${i + 1}.jpg`,
    content: Buffer.isBuffer(buf) ? buf.toString('base64') : buf
  }));

  const photoNote = attachments.length > 0
    ? `<p style="margin:0 0 28px;padding:16px 18px;background:rgba(184,149,106,.08);border-left:2px solid #b8956a;font-size:14px;color:#1a1814"><strong>📎 Dmytro's photos of your fresh tattoo are attached to this email.</strong> Save this email — you'll want to look back at these once it's healed.</p>`
    : '';

  const payload = {
    from: FROM(),
    to: email,
    subject: photos.length > 0
      ? 'Your tattoo photos + aftercare guide · the muse ink'
      : 'Aftercare guide · Your tattoo by Dmytro · the muse ink',
    html: wrap({
      title: 'Your aftercare guide.',
      sub: `For ${name} — keep this email.`,
      body: `
        ${photoNote}
        <p style="margin:0 0 24px">Thank you for the session today. To ensure your tattoo heals perfectly, follow these instructions carefully.</p>

        ${infoSection('Days 1–3 (The Protective Film)', [
          '<strong>Leave the film on.</strong> Keep the protective film on your tattoo for 3 full days. It protects the fresh tattoo from bacteria.',
          'You can shower normally, but do not submerge the area in water or let hot water hit it directly.',
          'If fluid (blood or excess ink) builds up under the film, this is completely normal. Do not puncture the film.'
        ])}

        ${infoSection('Day 3 — Film Removal & Washing', [
          'Gently peel off the film in a warm shower. Pull it slowly and parallel to your skin, not straight up.',
          'Once off, wash the tattoo immediately with lukewarm water and a mild, fragrance-free soap. Use your clean hands, never a washcloth.',
          'Pat dry with a clean paper towel. Do not rub.'
        ])}

        ${infoSection('Healing & Moisturizing (Weeks 1–3)', [
          'Apply a very thin layer of healing cream (like Bepanthen, Aquaphor, or similar) 2–3 times a day.',
          'Clean the tattoo gently twice a day before applying cream.',
          'Never pick, scratch, or peel the flakes. Itching is a normal sign of healing.'
        ])}

        ${infoSection('General Rules during Healing', [
          '<strong>No swimming, baths, saunas, or sea water</strong> for at least 2 weeks.',
          'Keep the tattoo out of direct sunlight. Once fully healed, always use <strong>SPF 50+</strong> sunscreen to protect the colors.'
        ])}

        ${warningCard('<strong>⚠️ IMPORTANT:</strong> If you notice persistent or spreading redness, swelling, throbbing pain, or weeping after day 3 — contact the studio immediately. Do not ignore signs of irritation or infection.')}

        <p style="margin:24px 0 8px;color:#8a7a65;font-size:13px">In 3 days you'll receive a reminder to remove the protective film.</p>
        <p style="margin:8px 0 0"><a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:2px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase">Questions? Write to us →</a></p>
      `
    }),
    ...(attachments.length > 0 ? { attachments } : {})
  };

  return safeSend(resend, payload, idempotencyKey ? { idempotencyKey } : undefined);
}

// ─── Email #5b: Aftercare Reminder (3 days after session) ───────────────
async function sendAftercareReminderEmail({ name, email }, { idempotencyKey } = {}) {
  const resend = getResend();
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;

  const payload = {
    from: FROM(),
    to: email,
    subject: 'Day 3 · Time to remove the film — the muse ink',
    html: wrap({
      title: 'Remove the film today.',
      sub: `Day 3 reminder for ${name}.`,
      body: `
        <p style="margin:0 0 24px">It's been 3 days since your session — time to remove the protective film.</p>

        ${infoSection('How to remove the film', [
          'Get in a warm shower and gently peel the film off, pulling slowly and parallel to your skin.',
          'Wash the tattoo immediately with lukewarm water and a mild, fragrance-free soap using clean hands.',
          'Pat dry with a clean paper towel — do not rub.'
        ])}

        ${infoSection('What to do after (next 7–10 days)', [
          'Apply a thin layer of healing cream (Bepanthen or similar) 2–3 times a day.',
          'Keep washing gently twice a day. The skin may peel slightly — this is completely normal.',
          '<strong>Do not scratch or pick at flakes.</strong> Never scratch or rub the tattoo.'
        ])}

        ${warningCard('<strong>Reminder — first 2 weeks:</strong> No swimming, baths, saunas, or sea water. No direct sunlight. Treat it like a wound — because it is one.')}

        <p style="margin:24px 0 8px;color:#8a7a65;font-size:13px">For the full aftercare guide, refer to the email we sent you on session day — it has everything step by step.</p>
        <p style="margin:8px 0 0"><a href="${waLink}" style="color:#b8956a;text-decoration:none;border-bottom:1px solid rgba(184,149,106,.4);padding-bottom:2px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase">Questions? Write to us →</a></p>
      `
    })
  };

  return safeSend(resend, payload, idempotencyKey ? { idempotencyKey } : undefined);
}

async function sendTouchupEmail({ name, email, type, leadId }, { idempotencyKey } = {}) {
  const resend = getResend();
  const waLink = WHATSAPP() ? `https://wa.me/${WHATSAPP()}` : INSTAGRAM_URL;
  const isFree = type === 'free';
  
  const depositUrl = `https://kaktuz.ink/touchup?name=${encodeURIComponent(name || '')}&email=${encodeURIComponent(email || '')}${leadId ? `&leadId=${leadId}` : ''}`;
  const buttonLink = isFree ? waLink : depositUrl;
  const buttonText = isFree ? 'Book your touchup →' : 'Pay deposit & book →';

  const payload = {
    from: FROM(),
    to: email,
    subject: isFree ? 'Your free touchup is ready · the muse ink' : 'Touchup session · the muse ink — €50',
    html: wrap({
      title: isFree ? 'Your free touchup.' : 'Time for a touchup.',
      sub: `For ${name} — one month after your session.`,
      body: `
        <p style="margin:0 0 24px">It has been about a month since your tattoo session. This is the perfect time for a touchup — the skin has fully healed and any small imperfections can now be corrected.</p>

        ${isFree
          ? `${infoSection('Your touchup is on us.', [
              'A quick, focused session to perfect any spots that need attention.',
              'Takes 15–45 minutes depending on the area.',
              'No charge — this is included as part of your session.'
            ])}`
          : `${infoSection('Touchup session — €50', [
              'A focused session to refine and perfect your piece.',
              'Takes 15–45 minutes depending on the area.',
              'Deposit of €50 is required to confirm your spot.'
            ])}`
        }

        <p style="margin:24px 0 0"><a href="${buttonLink}" style="display:inline-block;background:#2d3d28;color:#f5f0e8;text-decoration:none;padding:13px 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase">${buttonText}</a></p>
      `
    })
  };

  return safeSend(resend, payload, idempotencyKey ? { idempotencyKey } : undefined);
}

module.exports = {
  sendEnquiryConfirmation,
  sendRejectionEmail,
  sendBookingConfirmation,
  sendPreCareEmail,
  sendAftercareEmail,
  sendAftercareReminderEmail,
  sendTouchupEmail
};
