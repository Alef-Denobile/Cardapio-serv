const AuditLog = require('../models/AuditLog');

// Registra um evento no log de auditoria. Nunca lança erro pra fora — se o log
// falhar por qualquer motivo, a ação principal (login, exclusão, etc.) continua
// normalmente, só não fica registrada dessa vez.
async function registrarAuditoria(userId, acao, detalhe) {
  try {
    await AuditLog.create({ userId, acao, detalhe: detalhe || '' });
  } catch (err) {
    console.error('Erro ao registrar auditoria:', err.message);
  }
}

module.exports = { registrarAuditoria };
