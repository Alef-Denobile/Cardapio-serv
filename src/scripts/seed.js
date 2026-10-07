// Cria o restaurante de demonstração "Sabor da Casa" (cardápio com fotos, mesas e equipe) e o primeiro acesso de dev.
// Uso: npm run seed                              (não mexe em nada se o exemplo já existir)
//      npm run seed -- --com-historico           (inclui 30 dias de pedidos e avaliações de exemplo, para demonstrações)
//      npm run seed -- --reset --com-historico   (apaga e recria SOMENTE o restaurante de exemplo)
const bcrypt = require('bcryptjs');
const { conectar, sistema, encerrar } = require('../db');
const config = require('../config');
const { criarDemo, SLUG, SENHA, EMAILS } = require('../lib/demo');

(async () => {
  try {
    await conectar();
    const msg = await sistema(async c => {
      const base = config.urlPublica || `http://localhost:${config.porta}`;
      const linhas = [''];
      const r = await criarDemo(c, { reset: process.argv.includes('--reset'), historico: process.argv.includes('--com-historico') });
      if (!r) linhas.push('O restaurante de exemplo já existe. Use "npm run seed -- --reset" para recriá-lo.');
      else {
        const mesa1 = (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = 1', [r.rest.id])).rows[0];
        linhas.push('Restaurante de exemplo pronto: Sabor da Casa',
          `  Site do restaurante: ${base}/  (também em ${base}/r/${SLUG})`, `  Exemplo de QR da Mesa 1: ${base}/r/${SLUG}/mesa/1?t=${mesa1.token}`, `  Painel: ${base}/painel`,
          `  Logins (senha ${SENHA}): ${EMAILS.dono} · ${EMAILS.cozinha} · ${EMAILS.carlos}`);
        if (r.nHist) linhas.push(`  ${r.nHist} pedidos de exemplo dos últimos 30 dias e ${r.nAv} avaliações (para o histórico, o balanço e o mapa das mesas).`);
      }
      if (!(await c.query('SELECT 1 FROM admins LIMIT 1')).rowCount) {
        // Primeiro acesso de dev: ADMIN_INICIAL_EMAIL e ADMIN_INICIAL_SENHA (útil no plano gratuito do Render, que não tem Shell)
        const emailAdm = (process.env.ADMIN_INICIAL_EMAIL || '').trim().toLowerCase(), senhaAdm = process.env.ADMIN_INICIAL_SENHA || '';
        if (emailAdm && senhaAdm.length >= 10) {
          await c.query('INSERT INTO admins (nome, email, senha_hash) VALUES ($1, $2, $3)', [process.env.ADMIN_INICIAL_NOME || 'Dev', emailAdm, await bcrypt.hash(senhaAdm, 10)]);
          linhas.push(`  Área de devs: ${base}/admin  (${emailAdm} / a senha de ADMIN_INICIAL_SENHA)`);
        } else {
          if (emailAdm) linhas.push('  Aviso: ADMIN_INICIAL_SENHA precisa ter pelo menos 10 caracteres. Usando o acesso de dev padrão.');
          await c.query('INSERT INTO admins (nome, email, senha_hash) VALUES ($1, $2, $3)', ['Dev', 'dev@cardapio.dev', await bcrypt.hash('devs-troque-esta-senha', 10)]);
          linhas.push(`  Área de devs: ${base}/admin  (dev@cardapio.dev / devs-troque-esta-senha — crie a sua conta com "npm run novo-admin" e desative esta)`);
        }
      }
      if (r) linhas.push('  Troque essas senhas antes de usar com clientes reais.');
      linhas.push('');
      return linhas.join('\n');
    });
    console.log(msg);
  } catch (e) { console.error('Erro ao criar o exemplo:', e.message); process.exitCode = 1; }
  await encerrar();
})();
