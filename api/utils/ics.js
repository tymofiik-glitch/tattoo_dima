// Generates an iCalendar (.ics) string for a tattoo appointment
function pad(n) { return String(n).padStart(2, '0'); }

function toIcsDate(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    '00Z'
  );
}

function escapeText(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function generateIcs({ clientName, clientEmail, sessionDate, address, durationHours = 3 }) {
  const start = new Date(sessionDate);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const now = new Date();
  const uid = `tattoo-${start.getTime()}@kaktuz.ink`;
  const location = address || process.env.STUDIO_ADDRESS || 'Den Haag, Netherlands';
  const organizerEmail = (process.env.RESEND_FROM || '').match(/<(.+?)>/)?.[1] || 'hello@kaktuz.ink';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//the muse ink//Tattoo Appointment//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    'SUMMARY:Tattoo appointment · Dmytro Bilynets',
    `DESCRIPTION:${escapeText(`Your tattoo session with Dmytro Bilynets at the muse ink.\nAddress: ${location}`)}`,
    `LOCATION:${escapeText(location)}`,
    `ORGANIZER;CN=the muse ink:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${escapeText(clientName)}:mailto:${clientEmail || 'unknown@unknown.com'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

// Builds a Google Calendar add-event URL
function googleCalendarUrl({ sessionDate, address, durationHours = 3 }) {
  const start = new Date(sessionDate);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

  function fmt(d) {
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      '00Z'
    );
  }

  const location = address || process.env.STUDIO_ADDRESS || 'Den Haag, Netherlands';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Tattoo appointment · Dmytro Bilynets',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: 'Your tattoo session at the muse ink with Dmytro Bilynets.',
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

module.exports = { generateIcs, googleCalendarUrl };
