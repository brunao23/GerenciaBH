function normalizeLikelyWhatsappPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits;
}
function extractSharedContactPhone(payload) {
  const vcard = readString(
    payload?.vcard,
    payload?.data?.vcard,
    payload?.message?.contactMessage?.vcard,
    payload?.data?.message?.contactMessage?.vcard
  )
  if (vcard) {
    const match = vcard.match(/waid=(\d+)/i) || vcard.match(/TEL[^:]*:([^\n\r]+)/i)
    if (match && match[1]) return normalizeLikelyWhatsappPhone(match[1])
  }

  const quotedVcard = readString(
    payload?.quotedMsg?.vcard,
    payload?.data?.quotedMsg?.vcard,
    payload?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.contactMessage?.vcard,
    payload?.data?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.contactMessage?.vcard
  )
  if (quotedVcard) {
    const match = quotedVcard.match(/waid=(\d+)/i) || quotedVcard.match(/TEL[^:]*:([^\n\r]+)/i)
    if (match && match[1]) return normalizeLikelyWhatsappPhone(match[1])
  }

  const phonesArray = asArray(
    payload?.phones || payload?.data?.phones || payload?.contact?.phones || payload?.data?.contact?.phones
  )
  if (phonesArray.length > 0) {
    return normalizeLikelyWhatsappPhone(phonesArray[0])
  }

  const quotedPhones = asArray(payload?.quotedMsg?.phones || payload?.data?.quotedMsg?.phones)
  if (quotedPhones.length > 0) {
    return normalizeLikelyWhatsappPhone(quotedPhones[0])
  }

  return ""
}


const p1 = { vcard: 'BEGIN:VCARD\nTEL;waid=5531999998888:+55 31 99999-8888\nEND:VCARD' };
const p2 = { phones: ['5531999998888'] };
const p3 = { message: { contactMessage: { vcard: 'BEGIN:VCARD\nTEL;type=CELL;type=VOICE;waid=558288540645:+55 82 8854-0645\nEND:VCARD' } } };
const p4 = { vcard: 'BEGIN:VCARD\nTEL;type=CELL;type=VOICE:+55 82 8854-0645\nEND:VCARD' };

function asArray(val) { return Array.isArray(val) ? val : []; }
function readString(...vals) { for(const v of vals) if(v) return String(v); return ''; }

console.log('p1:', extractSharedContactPhone(p1));
console.log('p2:', extractSharedContactPhone(p2));
console.log('p3:', extractSharedContactPhone(p3));
console.log('p4:', extractSharedContactPhone(p4));
