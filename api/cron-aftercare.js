const { sendAftercareEmail, sendPreCareEmail, sendAftercareReminderEmail, sendTouchupEmail } = require('./utils/email');
const { notifyAlena, appendTimelineAndEdit, reopenForumTopic, renameForumTopic } = require('./utils/telegram');
const { setSecurityHeaders } = require('./utils/security');

// Daily cron — scans Airtable and triggers three email types with strong
// idempotency guarantees (Airtable lock TTL + Resend Idempotency-Key):
//   • Pre-care           — 7 days BEFORE the session, only if deposit is paid
//   • Aftercare (Day 0)  — Day of the session, only if scheduled or completed
//   • Aftercare Reminder — 3 days AFTER the session, only if completed
// Also runs autoMarkCompleted to flip past `scheduled` sessions to `completed`.

const LOCK_TTL_MIN = 10;

async function fetchSessionPhotos(photoIdsField) {
  if (!photoIdsField) return [];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];
  const ids = photoIdsField.split(',').map(s => s.trim()).filter(Boolean);
  const buffers = [];
  for (const fileId of ids) {
    try {
      const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const { result } = await meta.json();
      if (!result?.file_path) continue;
      const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${result.file_path}`);
      const buf = Buffer.from(await fileRes.arrayBuffer());
      buffers.push(buf);
    } catch(e) { console.error('fetchSessionPhotos error for', fileId, e.message); }
  }
  return buffers;
}

const TYPE_CONFIG = {
  precare: {
    sentField:    'PreCareSentAt',
    lockField:    'PreCareLockedAt',
    extraFilter:  "{Mollie Payment ID} != ''",
    targetOffset: +7,
    send: (record, opts) => sendPreCareEmail({
      name: record.fields.Name || 'there',
      email: record.fields.Email,
      sessionDate: record.fields['Session Date'],
      address: record.fields.Address
    }, opts),
    onSuccess: null
  },
  aftercare: {
    sentField:    'AftercareSentAt',
    lockField:    'AftercareLockedAt',
    extraFilter:  "OR({Session Status} = 'scheduled', {Session Status} = 'completed')",
    targetOffset: 0,
    send: async (record, opts) => {
      const photos = await fetchSessionPhotos(record.fields['Session Photo IDs']);
      return sendAftercareEmail({
        name: record.fields.Name || 'there',
        email: record.fields.Email,
        photos
      }, opts);
    },
    onSuccess: async (record) => {
      const today = new Date().toISOString().split('T')[0];
      await appendTimelineAndEdit(
        record,
        `✅ Aftercare sent · ${today}`,
        { status: 'session_done' }
      );
    }
  },
  aftercare_reminder: {
    sentField:    'AftercareReminderSentAt',
    lockField:    'AftercareReminderLockedAt',
    extraFilter:  "{Session Status} = 'completed'",
    targetOffset: -3,
    send: (record, opts) => sendAftercareReminderEmail({
      name: record.fields.Name || 'there',
      email: record.fields.Email
    }, opts),
    onSuccess: async (record) => {
      const today = new Date().toISOString().split('T')[0];
      await appendTimelineAndEdit(
        record,
        `✅ Aftercare reminder sent · ${today}`,
        { status: 'session_done' }
      );
    }
  },
  touchup: {
    sentField:    'TouchupSentAt',
    lockField:    'TouchupLockedAt',
    extraFilter:  "AND({Session Status} = 'completed', OR({Touchup Type} = 'free', {Touchup Type} = 'paid'))",
    targetOffset: -30,
    send: (record, opts) => sendTouchupEmail({
      name: record.fields.Name || 'there',
      email: record.fields.Email,
      type: record.fields['Touchup Type'] || 'free',
      leadId: record.id
    }, opts),
    onSuccess: async (record) => {
      const today = new Date().toISOString().split('T')[0];
      const type = record.fields['Touchup Type'] || 'free';
      await appendTimelineAndEdit(
        record,
        `💆 Touchup email sent (${type}) · ${today}`,
        { status: 'session_done' }
      );
      // Reopen topic so the client is visible again for the touchup
      const chatId = process.env.TELEGRAM_CHAT_ID;
      const topicId = record.fields['Telegram Topic ID'];
      if (chatId && topicId) {
        await reopenForumTopic(chatId, topicId);
        await renameForumTopic(chatId, topicId, `🔁 ${record.fields.Name || 'Client'}`);
      }
    }
  }
};

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function targetDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toDateStr(d);
}

function airtableBaseUrl() {
  return `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID?.trim()}`;
}

function airtableAuth() {
  return { 'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN?.trim()}` };
}

async function fetchRecords(filterFormula) {
  const url = `${airtableBaseUrl()}/CRM_Leads?filterByFormula=${encodeURIComponent(filterFormula)}`;
  const r = await fetch(url, { headers: airtableAuth() });
  const data = await r.json();
  return data.records || [];
}

async function patchRecord(recordId, fields) {
  const r = await fetch(`${airtableBaseUrl()}/CRM_Leads/${recordId}`, {
    method: 'PATCH',
    headers: { ...airtableAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Airtable PATCH ${recordId} failed: ${r.status} ${txt}`);
  }
  return r.json();
}

async function getRecord(recordId) {
  const r = await fetch(`${airtableBaseUrl()}/CRM_Leads/${recordId}`, {
    headers: airtableAuth()
  });
  if (!r.ok) throw new Error(`Airtable GET ${recordId} failed: ${r.status}`);
  return r.json();
}

async function acquireLock(record, lockField, myStamp) {
  await patchRecord(record.id, { [lockField]: myStamp });
  await new Promise(r => setTimeout(r, 300));
  const fresh = await getRecord(record.id);
  const current = fresh.fields?.[lockField];
  return current === myStamp;
}

async function releaseLock(recordId, lockField) {
  try {
    await patchRecord(recordId, { [lockField]: null });
  } catch (err) {
    console.error('Lock release failed:', err.message);
  }
}

function buildFilter(cfg, target) {
  const ttlClause = `OR(NOT({${cfg.lockField}}), IS_BEFORE({${cfg.lockField}}, DATEADD(NOW(),-${LOCK_TTL_MIN},'minutes')))`;
  const dateClause = `IS_SAME({Session Date}, '${target}', 'day')`;
  return `AND(${dateClause}, NOT({${cfg.sentField}}), ${cfg.extraFilter}, ${ttlClause})`;
}

function formatErrorAlert(type, record, err) {
  const f = record.fields || {};
  return [
    `⚠️ *CRON ERROR* (${type})`,
    `👤 ${f.Name || 'Unknown'} · ${f.Email || 'no email'}`,
    `📅 Session: ${f['Session Date'] || 'unknown'}`,
    `🆔 \`${record.id}\``,
    `❌ ${err.message || String(err)}`,
    `🔁 Lock released, will retry next run.`
  ].join('\n');
}

async function processBatch(type, target) {
  const cfg = TYPE_CONFIG[type];
  const records = await fetchRecords(buildFilter(cfg, target));
  let sent = 0, failed = 0, skipped = 0;

  for (const record of records) {
    if (!record.fields?.Email) { skipped++; continue; }

    const myStamp = new Date().toISOString();
    let gotLock = false;

    try {
      gotLock = await acquireLock(record, cfg.lockField, myStamp);
      if (!gotLock) { skipped++; continue; }

      const idempotencyKey = `${record.id}-${type}-${target}`;
      await cfg.send(record, { idempotencyKey });

      await patchRecord(record.id, {
        [cfg.sentField]: new Date().toISOString(),
        [cfg.lockField]: null
      });

      if (cfg.onSuccess) {
        try {
          const fresh = await getRecord(record.id);
          await cfg.onSuccess(fresh);
        } catch (err) {
          console.error(`${type} onSuccess failed for ${record.id}:`, err.message);
        }
      }

      sent++;
      console.log(`${type} sent to ${record.fields.Email}`);
    } catch (err) {
      failed++;
      console.error(`${type} failed for ${record.id}:`, err.message);
      if (gotLock) await releaseLock(record.id, cfg.lockField);
      await notifyAlena(formatErrorAlert(type, record, err));
    }
  }

  return { target, sent, failed, skipped, total: records.length };
}

async function autoMarkCompleted() {
  const formula = `AND(IS_BEFORE({Session Date}, TODAY()), {Session Status} = 'scheduled')`;
  const records = await fetchRecords(formula);
  let flipped = 0;
  for (const record of records) {
    try {
      await patchRecord(record.id, { 'Session Status': 'completed' });
      flipped++;
    } catch (err) {
      console.error(`autoMarkCompleted failed for ${record.id}:`, err.message);
    }
  }
  return { flipped, scanned: records.length };
}

module.exports = async (req, res) => {
  setSecurityHeaders(res);
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: 'Missing Airtable credentials' });
  }

  try {
    const completedSweep = await autoMarkCompleted();
    const preRes   = await processBatch('precare',   targetDate(+7));
    const postRes  = await processBatch('aftercare', targetDate(0));
    const remRes   = await processBatch('aftercare_reminder', targetDate(-3));
    const touchRes = await processBatch('touchup', targetDate(-30));

    const summary = {
      ok: true,
      autoCompleted: completedSweep,
      preCare:   preRes,
      aftercare: postRes,
      aftercareReminder: remRes,
      touchup: touchRes
    };

    const totalFailed = preRes.failed + postRes.failed + remRes.failed + touchRes.failed;
    if (totalFailed > 0) {
      await notifyAlena(
        `📊 Cron ${new Date().toISOString().split('T')[0]}: ` +
        `precare ${preRes.sent}/${preRes.total}, ` +
        `aftercare ${postRes.sent}/${postRes.total}, ` +
        `reminder ${remRes.sent}/${remRes.total}, ` +
        `touchup ${touchRes.sent}/${touchRes.total}, ` +
        `*failures: ${totalFailed}*`
      );
    }

    console.log('Cron summary:', JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (err) {
    console.error('Cron fatal error:', err.message);
    await notifyAlena(`🚨 *CRON FATAL* ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
};
