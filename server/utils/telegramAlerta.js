// Manda um alerta pro Telegram quando algo crítico acontece no servidor (o app
// travar, uma promise sem tratamento, etc.). Não depende da API do WhatsApp nem de
// verificação de empresa — só precisa de um bot do Telegram (gratuito, sem
// aprovação nenhuma) configurado via variável de ambiente.
//
// Como configurar (uma vez só):
//   1. No Telegram, procure o "@BotFather" e mande /newbot — ele te dá um token.
//   2. Mande uma mensagem qualquer pro seu bot novo (ele não te chama primeiro).
//   3. Acesse https://api.telegram.org/bot<SEU_TOKEN>/getUpdates no navegador —
//      vai aparecer um número em "chat":{"id": ...} — esse é o seu TELEGRAM_CHAT_ID.
//   4. No Render (e no seu .env local), defina:
//      TELEGRAM_BOT_TOKEN=<o token do passo 1>
//      TELEGRAM_CHAT_ID=<o número do passo 3>
//
// Enquanto essas duas variáveis não estiverem configuradas, a função simplesmente
// não faz nada (sem erro, sem travar o resto do sistema).
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function enviarAlertaTelegram(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return; // não configurado ainda — silencioso, de propósito
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `🚨 Painel CRM — falha crítica no servidor\n\n${mensagem}`.slice(0, 4000),
      }),
    });
  } catch (e) {
    // Se nem o alerta conseguir sair, só registra no terminal — nunca deixa isso
    // derrubar o tratamento de erro que já estava rolando.
    process.stderr.write(`Falha ao enviar alerta pro Telegram: ${e.message}\n`);
  }
}

module.exports = { enviarAlertaTelegram, telegramConfigurado: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) };
