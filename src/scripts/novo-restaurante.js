// Uso: npm run novo-restaurante -- --nome "Pizzaria do Zé" --slug pizzaria-do-ze --email ze@email.com --senha "umaSenhaForte" [--mesas 15]
const { conectar, sistema, encerrar } = require('../db');
const { criarRestaurante } = require('../lib/criarRestaurante');
const config = require('../config');

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1], i++;
  return o;
}

(async () => {
  const o = args();
  try {
    await conectar();
    const { rest } = await sistema(c => criarRestaurante(c, { nome: o.nome, slug: String(o.slug || '').toLowerCase(), email: o.email, senha: o.senha, nomeDono: o.dono || 'Dono', mesas: Number(o.mesas || 10) }));
    const base = config.urlPublica || `http://localhost:${config.porta}`;
    console.log(`\nRestaurante criado: ${rest.nome}`);
    console.log(`Cardápio (delivery): ${base}/r/${rest.slug}`);
    console.log(`Painel: ${base}/painel  (entre com ${o.email})`);
    console.log('Os QR Codes das mesas ficam no painel, aba "Mesas e QR Codes".\n');
  } catch (e) { console.error('Não foi possível criar:', e.message); process.exitCode = 1; }
  await encerrar();
})();
