const assert = require('assert');

function parseAmsterdamDate(dateStr) {
  const isoStr = dateStr.trim().replace(' ', 'T') + ':00';
  const candidate = new Date(isoStr + '+01:00');
  if (isNaN(candidate.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(candidate);
  const getVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);
  const localUTC = Date.UTC(
    getVal('year'),
    getVal('month') - 1,
    getVal('day'),
    getVal('hour') === 24 ? 0 : getVal('hour'),
    getVal('minute')
  );
  const offsetHours = (localUTC - candidate.getTime()) / (3600 * 1000);
  const finalOffsetStr = '+' + String(offsetHours).padStart(2, '0') + ':00';
  return new Date(isoStr + finalOffsetStr);
}

// 1. Summer date (CEST - UTC+2)
const summerDate = parseAmsterdamDate('2025-06-15 14:00');
console.log('Summer input: 2025-06-15 14:00');
console.log('Summer ISOString (should be 2025-06-15T12:00:00.000Z):', summerDate.toISOString());
assert.strictEqual(summerDate.toISOString(), '2025-06-15T12:00:00.000Z');

// 2. Winter date (CET - UTC+1)
const winterDate = parseAmsterdamDate('2025-12-15 14:00');
console.log('Winter input: 2025-12-15 14:00');
console.log('Winter ISOString (should be 2025-12-15T13:00:00.000Z):', winterDate.toISOString());
assert.strictEqual(winterDate.toISOString(), '2025-12-15T13:00:00.000Z');

console.log('All timezone parsing tests passed successfully!');
