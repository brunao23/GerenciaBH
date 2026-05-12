const fs = require('fs');
const file = 'c:/Users/WINDOWS/Downloads/GerenciaBH/app/api/agent/webhooks/zapi/route.ts';
let code = fs.readFileSync(file, 'utf8');

const normalizeFn = `function normalizeLikelyWhatsappPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\\D/g, '');
  return digits;
}`;

const extractFn = code.substring(code.indexOf('function extractSharedContactPhone'), code.indexOf('function extractPhone(payload'));
const testCode = normalizeFn + '\n' + extractFn.replace(': string', '').replace(': any', '') + `
const p1 = { vcard: 'BEGIN:VCARD\\nTEL;waid=5531999998888:+55 31 99999-8888\\nEND:VCARD' };
const p2 = { phones: ['5531999998888'] };
const p3 = { message: { contactMessage: { vcard: 'BEGIN:VCARD\\nTEL;type=CELL;type=VOICE;waid=558288540645:+55 82 8854-0645\\nEND:VCARD' } } };
const p4 = { vcard: 'BEGIN:VCARD\\nTEL;type=CELL;type=VOICE:+55 82 8854-0645\\nEND:VCARD' };

function asArray(val) { return Array.isArray(val) ? val : []; }
function readString(...vals) { for(const v of vals) if(v) return String(v); return ''; }

console.log('p1:', extractSharedContactPhone(p1));
console.log('p2:', extractSharedContactPhone(p2));
console.log('p3:', extractSharedContactPhone(p3));
console.log('p4:', extractSharedContactPhone(p4));
`;
fs.writeFileSync('test.js', testCode);
