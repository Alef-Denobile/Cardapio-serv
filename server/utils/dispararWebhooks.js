const WebhookSaida = require('../models/WebhookSaida');

// Dispara todos os webhooks de saída do usuário que estão cadastrados pra esse
// evento — usado pra conectar o CRM com Zapier, Make, n8n ou qualquer outra
// ferramenta que aceite receber um POST. Nunca lança erro pra fora nem trava quem
// chamou: o disparo roda em segundo plano, best-effort.
async function dispararWebhooks(userId, evento, dados) {
  try {
    const webhooks = await WebhookSaida.find({ userId, ativo: true, eventos: evento });
    for (const wh of webhooks) {
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Painel-Crm-Secret': wh.secreto },
        body: JSON.stringify({ evento, dados, disparadoEm: new Date().toISOString() }),
      })
        .then(() => {
          wh.ultimoEnvioEm = new Date();
          wh.ultimoEnvioStatus = 'ok';
          wh.save().catch(() => {});
        })
        .catch(() => {
          wh.ultimoEnvioEm = new Date();
          wh.ultimoEnvioStatus = 'erro';
          wh.save().catch(() => {});
        });
    }
  } catch (e) {
    console.error('Erro ao disparar webhooks de saída:', e.message);
  }
}

module.exports = { dispararWebhooks };
