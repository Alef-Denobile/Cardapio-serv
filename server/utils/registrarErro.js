const ErrorLog = require('../models/ErrorLog');

// Guarda um erro no banco pra aparecer no painel de monitoramento (visível só pra
// supervisores). Nunca lança erro por conta própria — se o próprio log falhar (ex:
// banco fora do ar), só avisa no console e segue a vida, sem derrubar o resto.
async function registrarErro({ mensagem, stack, rota, userId, tipo }) {
  try {
    await ErrorLog.create({
      mensagem: String(mensagem || 'Erro sem mensagem').slice(0, 2000),
      stack: String(stack || '').slice(0, 4000),
      rota: rota || '',
      userId: userId || null,
      tipo: tipo || 'rota',
    });
  } catch (e) {
    process.stderr.write(`Falha ao registrar erro no log de monitoramento: ${e.message}\n`);
  }
}

module.exports = { registrarErro };
