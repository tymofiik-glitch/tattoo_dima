const { sendAftercareEmail } = require('./utils/email');

module.exports = async (req, res) => {
  // Allow manual trigger via GET for testing
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const airtableToken = process.env.AIRTABLE_TOKEN?.trim();
  const airtableBase  = process.env.AIRTABLE_BASE_ID?.trim();

  if (!airtableToken || !airtableBase) {
    return res.status(500).json({ error: 'Missing Airtable credentials' });
  }

  // Target date: 3 days ago (Amsterdam timezone, date only)
  const target = new Date();
  target.setDate(target.getDate() - 3);
  const targetDate = target.toISOString().split('T')[0]; // "YYYY-MM-DD"

  const formula = encodeURIComponent(
    `AND({Session Date} = '${targetDate}', NOT({Aftercare Sent}))`
  );

  try {
    const listRes = await fetch(
      `https://api.airtable.com/v0/${airtableBase}/CRM_Leads?filterByFormula=${formula}`,
      { headers: { 'Authorization': `Bearer ${airtableToken}` } }
    );
    const listData = await listRes.json();
    const records = listData.records || [];

    console.log(`Aftercare cron: ${records.length} records for ${targetDate}`);

    const results = await Promise.allSettled(records.map(async (record) => {
      const { Name, Email } = record.fields;
      if (!Email) return;

      await sendAftercareEmail({ name: Name || 'there', email: Email });

      // Mark as sent
      await fetch(`https://api.airtable.com/v0/${airtableBase}/CRM_Leads/${record.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: { 'Aftercare Sent': true } })
      });

      console.log(`Aftercare sent to ${Email}`);
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return res.status(200).json({ ok: true, sent, failed, targetDate });
  } catch (err) {
    console.error('Aftercare cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
