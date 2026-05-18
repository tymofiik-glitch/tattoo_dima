const { sendAftercareEmail, sendPreCareEmail } = require('./utils/email');

// Daily cron: scans Airtable and triggers two email types:
//   • Pre-care   — 7 days BEFORE the session  (field: PreCareSent)
//   • Aftercare  — 3 days AFTER the session   (field: Aftercare Sent)
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();

  if (!airtableToken || !airtableBase) {
    return res.status(500).json({ error: 'Missing Airtable credentials' });
  }

  const toDateStr = (d) => d.toISOString().split('T')[0];

  const preCareDate  = new Date(); preCareDate.setDate(preCareDate.getDate() + 7);
  const aftercareDate = new Date(); aftercareDate.setDate(aftercareDate.getDate() - 3);

  const preCareTarget  = toDateStr(preCareDate);
  const aftercareTarget = toDateStr(aftercareDate);

  async function fetchRecords(filterFormula) {
    const formula = encodeURIComponent(filterFormula);
    const r = await fetch(
      `https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`,
      { headers: { 'Authorization': `Bearer ${airtableToken}` } }
    );
    const data = await r.json();
    return data.records || [];
  }

  async function patchRecord(recordId, fields) {
    return fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${recordId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  }

  try {
    // ─── Pre-care (T-7) ────────────────────────────────────────────
    const preCareRecords = await fetchRecords(
      `AND({Session Date} = '${preCareTarget}', NOT({PreCareSent}))`
    );

    const preCareResults = await Promise.allSettled(preCareRecords.map(async (record) => {
      const { Name, Email, 'Session Date': sessionDate, Address } = record.fields;
      if (!Email) return;
      await sendPreCareEmail({ name: Name || 'there', email: Email, sessionDate, address: Address });
      await patchRecord(record.id, { 'PreCareSent': true });
      console.log(`Pre-care sent to ${Email}`);
    }));

    // ─── Aftercare (T+3) ───────────────────────────────────────────
    const aftercareRecords = await fetchRecords(
      `AND({Session Date} = '${aftercareTarget}', NOT({Aftercare Sent}))`
    );

    const aftercareResults = await Promise.allSettled(aftercareRecords.map(async (record) => {
      const { Name, Email } = record.fields;
      if (!Email) return;
      await sendAftercareEmail({ name: Name || 'there', email: Email });
      await patchRecord(record.id, { 'Aftercare Sent': true });
      console.log(`Aftercare sent to ${Email}`);
    }));

    const summary = {
      ok: true,
      preCare:  { target: preCareTarget,  sent: preCareResults.filter(r => r.status === 'fulfilled').length,  failed: preCareResults.filter(r => r.status === 'rejected').length  },
      aftercare:{ target: aftercareTarget, sent: aftercareResults.filter(r => r.status === 'fulfilled').length, failed: aftercareResults.filter(r => r.status === 'rejected').length }
    };

    console.log('Cron summary:', summary);
    return res.status(200).json(summary);
  } catch (err) {
    console.error('Cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
