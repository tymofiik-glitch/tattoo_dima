const fs = require('fs');

const text = `
🟢 *NEW LEAD*
👤 Antigravity Test V2

📱 +31611111111 • 📸 @antigravity_test2
📧 test2@example.com

🖼 TATTOO DETAILS
📐 Size: Small • 📍 Place: Wrist
💰 Budget: €150-300

📝 IDEA:
▎ A small minimalistic star on the wrist, version 2

📓 NOTES:
▎ N/A
`;

const extractField = require('./api/telegram-webhook.js').__get__ ? null : null; 
// Actually I'll just copy the function:

function extractFieldLocal(text, label) {
  if (!text) return '';
  const clean = text.replace(/[*_\`\[\]]/g, '');
  
  const newPatterns = {
    'CLIENT': /👤\s*([^\n]+)/,
    'EMAIL': /📧\s*([^\n]+)/,
    'IG': /📸\s*([^\n•]+)/,
    'PHONE': /📱\s*([^\n•]+)/,
    'SIZE': /📐\s*Size:\s*([^\n•]+)/i,
    'PLACE': /📍\s*Place:\s*([^\n]+)/i,
    'BUDGET': /💰\s*Budget:\s*([^\n]+)/i
  };

  if (newPatterns[label]) {
    const match = clean.match(newPatterns[label]);
    if (match && match[1]) return match[1].trim();
  }

  if (label === 'IDEA' || label === 'NOTES') {
    const header = label === 'IDEA' ? '📝 IDEA:' : '📓 NOTES:';
    const lines = clean.split('\n');
    let capture = false;
    let result = [];
    for (let line of lines) {
      if (line.includes('TIMELINE') || (label === 'IDEA' && line.includes('📓 NOTES:'))) {
        capture = false;
        break;
      }
      if (capture) {
        if (line.trim().startsWith('▎')) {
          let val = line.replace('▎', '').trim();
          if (val && val !== 'N/A') result.push(val);
        } else if (line.trim() !== '') {
          result.push(line.trim());
        }
      }
      if (line.includes(header)) capture = true;
    }
    if (result.length > 0) return result.join('\n');
  }
  return '';
}

console.log('CLIENT:', extractFieldLocal(text, 'CLIENT'));
console.log('EMAIL:', extractFieldLocal(text, 'EMAIL'));
console.log('IG:', extractFieldLocal(text, 'IG'));
console.log('PHONE:', extractFieldLocal(text, 'PHONE'));
console.log('SIZE:', extractFieldLocal(text, 'SIZE'));
console.log('PLACE:', extractFieldLocal(text, 'PLACE'));
console.log('BUDGET:', extractFieldLocal(text, 'BUDGET'));
console.log('IDEA:', extractFieldLocal(text, 'IDEA'));
console.log('NOTES:', extractFieldLocal(text, 'NOTES'));
