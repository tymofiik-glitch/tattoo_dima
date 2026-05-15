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

function generateIcs({ clientName, sessionDate, durationHours = 3 }) {
  const start = new Date(sessionDate);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const now = new Date();
  const uid = `tattoo-${start.getTime()}@themuseink.nl`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Muse Ink//Tattoo Appointment//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:Tattoo appointment · Dmytro Bilynets`,
    `DESCRIPTION:Your tattoo session with Dmytro Bilynets at The Muse Ink.\\nAddress: Regentessekwartier\\, Den Haag\\, Netherlands.`,
    `LOCATION:Regentessekwartier, Den Haag, Netherlands`,
    `ORGANIZER;CN=The Muse Ink:mailto:${process.env.RESEND_FROM || 'noreply@themuseink.nl'}`,
    `ATTENDEE;CN=${clientName}:mailto:unknown@unknown.com`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

// Builds a Google Calendar add-event URL
function googleCalendarUrl({ sessionDate, durationHours = 3 }) {
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

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Tattoo appointment · Dmytro Bilynets',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: 'Your tattoo session at The Muse Ink studio.',
    location: 'Regentessekwartier, Den Haag, Netherlands',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

module.exports = { generateIcs, googleCalendarUrl };
