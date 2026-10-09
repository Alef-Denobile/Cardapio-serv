// Transforma qualquer formato de telefone digitado (com espaço, parênteses, +55, etc.)
// no formato que a API do WhatsApp espera: só dígitos, com o 55 do Brasil na frente
// quando a pessoa não digitou o código do país.
function normalizarTelefone(tel) {
  let digitos = String(tel || '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length <= 11) digitos = '55' + digitos; // assume Brasil se não veio com DDI
  return digitos;
}

module.exports = { normalizarTelefone };
