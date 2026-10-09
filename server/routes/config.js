const express = require('express');
const router = express.Router();

// GET /api/config/integracoes -> diz quais integrações que dependem de credenciais do
// SERVIDOR (não do usuário) estão configuradas nesse ambiente — pública, sem login, só
// com valores true/false (nunca as chaves em si). O front-end usa isso pra esconder ou
// avisar sobre integrações que não vão funcionar nesse servidor, em vez de deixar a
// pessoa clicar num botão que só vai dar erro. Pensado pra quando o painel for vendido/
// instalado por fora, sem toda a infraestrutura (Google Cloud, IA) já configurada.
router.get('/integracoes', (req, res) => {
  res.json({
    // Client ID do Google não é segredo (só o Client Secret é) — é normal ele viajar pro
    // navegador, é assim que o botão "Continuar com Google" sempre funcionou. Mandar ele
    // aqui, em vez de fixo no login.js, é o que permite cada empresa que usar esse painel
    // configurar o Google dela só com variáveis de ambiente, sem mexer em código.
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleAgenda: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    assistenteIA: !!process.env.ANTHROPIC_API_KEY,
    whatsappWebhook: !!process.env.WHATSAPP_VERIFY_TOKEN,
    instagramWebhook: !!process.env.INSTAGRAM_VERIFY_TOKEN,
    telegramAlerta: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  });
});

module.exports = router;
