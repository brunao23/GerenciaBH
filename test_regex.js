function sanitizeGreeting(text) {
  if (!text) return text;
  // Regex to catch common greetings and the following name
  return text.replace(/(Bom dia|Boa tarde|Boa noite|Ol[aá]|Oie?)([\s.,!?-]+)([A-Z][a-z]+)/gi, "$1$2[nome do lead]");
}
console.log(sanitizeGreeting('Bom dia, Jullyeth! Aqui é a Bia da Vox2You'));
console.log(sanitizeGreeting('Olá Maria, tudo bem?'));
console.log(sanitizeGreeting('Oi, João Victor! Como vai?'));
console.log(sanitizeGreeting('Bom dia Fernanda.'));
