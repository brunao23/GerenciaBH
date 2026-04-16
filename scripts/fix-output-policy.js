const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'lib', 'services', 'native-agent-orchestrator.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldLine = 'const responseText = sanitizeAssistantReplyText(String(decision.reply || ""))';
const newLine = 'const responseText = applyAssistantOutputPolicy(String(decision.reply || ""), { allowEmojis: config.moderateEmojiEnabled === true })';

if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLine);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: output policy fix applied');
} else {
  console.log('WARNING: pattern not found, checking file...');
  const lines = content.split('\n');
  for (let i = 1745; i <= 1752; i++) {
    console.log(`Line ${i+1}: ${lines[i]}`);
  }
}
