// TEMPORARY one-shot endpoint to preview all 5 email templates without
// running the full booking flow. Sends every template with mocked data
// to the provided `to` query param. DELETE THIS FILE after the preview run.
//
// Usage: GET /api/_preview-emails?to=foo@bar.com&token=<PREVIEW_TOKEN>
//
// Why a token? This endpoint sends 5 emails per call — without protection
// anyone scraping the deploy could burn through the Resend quota.

const {
  sendEnquiryConfirmation,
  sendDepositConfirmation,
  sendAppointmentCalendar,
  sendPreCareEmail,
  sendAftercareEmail
} = require('./utils/email');
const { generateIcs, googleCalendarUrl } = require('./utils/ics');

module.exports = async (req, res) => {
  const { to, token } = req.query || {};
  const expected = process.env.PREVIEW_TOKEN || 'preview-tymofii-2026';
  if (token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Provide valid ?to=email' });
  }

  const name = 'Tymofii';
  const sessionDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  sessionDate.setUTCHours(12, 0, 0, 0);

  const icsContent = generateIcs({ clientName: name, clientEmail: to, sessionDate, address: null });
  const googleUrl  = googleCalendarUrl({ sessionDate, address: null });

  const results = {};
  const run = async (label, fn) => {
    try { await fn(); results[label] = 'sent'; }
    catch (e) { results[label] = 'FAILED: ' + e.message; }
  };

  await run('1_enquiry',     () => sendEnquiryConfirmation({ name, email: to }));
  await run('3a_deposit',    () => sendDepositConfirmation({ name, email: to }));
  await run('3b_appointment',() => sendAppointmentCalendar({ name, email: to, sessionDate, address: null, icsContent, googleUrl }));
  await run('4_precare',     () => sendPreCareEmail({ name, email: to, sessionDate, address: null }));
  await run('5_aftercare',   () => sendAftercareEmail({ name, email: to }));

  return res.status(200).json({ to, results });
};
