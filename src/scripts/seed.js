// Cria as 3 demonstrações (lanchonete Sabor da Casa, sorveteria Gelato & Cia e restaurante Cantina Bella) e o primeiro acesso de dev.
// Uso: npm run seed                              (cria só as demonstrações que ainda não existem; não mexe nas outras)
//      npm run seed -- --com-historico           (inclui 30 dias de pedidos e avaliações de exemplo, para demonstrações)
//      npm run seed -- --reset --com-historico   (apaga e recria SOMENTE as 3 demonstrações)
const bcrypt = require('bcryptjs');
const { conectar, sistema, encerrar } = require('../db');
const config = require('../config');
const { criarDemos } = require('../lib/demo');
const { TIPOS } = require('../lib/tipos');

(async () => {
  try {
    await conectar();
    const msg = await sistema(async c => {
      const base = config.urlPublica || `http://localhost:${config.porta}`;
      const linhas = [''];
      const feitos = await criarDemos(c, { reset: process.argv.includes('--reset'), historico: process.argv.includes('--com-historico') });
      if (!feitos.length) linhas.push('As demonstrações já existem. Use "npm run seed -- --reset --com-historico" para recriá-las.');
      for (const r of feitos) {
        const d = r.demo, mesa1 = (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = 1', [r.rest.id])).rows[0];
        linhas.push(`Demonstração pronta: ${d.nome} (${TIPOS[d.tipo].nome.toLowerCase()})`, `  Site: ${base}/r/${d.slug}`);
        if (mesa1) linhas.push(`  QR da Mesa 1: ${base}/r/${d.slug}/mesa/1?t=${mesa1.token}`);
        linhas.push(`  Painel: ${base}/painel  (senha ${d.senha}): ${[d.emails.dono, d.emails.cozinha].concat(d.emails.entregadores.map(e => e[1])).join(' · ')}`);
        if (r.nHist) linhas.push(`  ${r.nHist} pedidos de exemplo dos últimos 30 dias e ${r.nAv} avaliações.`);
        linhas.push('');
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
      if (feitos.length) linhas.push('  Troque essas senhas antes de usar com clientes reais.');
      linhas.push('');
      return linhas.join('\n');
    });
    console.log(msg);
  } catch (e) { console.error('Erro ao criar o exemplo:', e.message); process.exitCode = 1; }
  await encerrar();
})();
