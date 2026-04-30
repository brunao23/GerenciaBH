
function sanitizeNamesFromExamples(text) {
  if (!text) return text;
  let sanitized = text;
  sanitized = sanitized.replace(/(Bom dia|Boa tarde|Boa noite)/gi, '[SAUDAÇÃO]');
  sanitized = sanitized.replace(/(\[SAUDAÇÃO\]|Ol[aá]|Oie?)([\s.,!?-]+)([A-ZÀ-Ÿ][a-zà-ÿ]{2,15})/gi, '\\[NOME_DO_LEAD]');
  sanitized = sanitized.replace(/^([A-ZÀ-Ÿ][a-zà-ÿ]{2,15})([\s]*[,!?-])/g, '[NOME_DO_LEAD]\');
  return sanitized;
}
console.log(sanitizeNamesFromExamples('Bom dia, Jullyeth! Tudo bem?'));
console.log(sanitizeNamesFromExamples('Boa noite Maria, já vi aqui.'));
console.log(sanitizeNamesFromExamples('Olá Pedro. Como vai?'));
console.log(sanitizeNamesFromExamples('Fernanda, pode me mandar?'));

