const {
  sendEnquiryConfirmation,
  sendRejectionEmail,
  sendDepositConfirmation,
  sendAppointmentCalendar,
  sendPreCareEmail,
  sendAftercareEmail
} = require('./utils/email.js');
const { generateIcs } = require('./utils/ics.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function handler(req, res) {
  const user = { name: 'Tymofii Final Test', email: 't.korobenko@icloud.com' };
  
  try {
    await sendEnquiryConfirmation(user);
    await delay(1000);
    
    await sendRejectionEmail(user);
    await delay(1000);
    
    await sendDepositConfirmation(user);
    await delay(1000);

    const sessionDate = '2026-06-25T14:00:00.000Z';
    const icsContent = generateIcs({
      id: 'test-event-123',
      date: sessionDate,
      name: user.name,
      address: 'the muse ink studio'
    });
    
    await sendAppointmentCalendar({
      ...user,
      sessionDate,
      address: 'the muse ink studio',
      icsContent,
      googleUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tattoo+Session'
    });
    await delay(1000);

    await sendPreCareEmail({ ...user, sessionDate, address: 'the muse ink studio' });
    await delay(1000);
    
    await sendAftercareEmail(user);

    res.status(200).json({ success: true, message: '6 emails sent!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
