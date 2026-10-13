// Uso: npm run novo-restaurante -- --nome "Pizzaria do Zé" --slug pizzaria-do-ze --email ze@email.com --senha "umaSenhaForte" [--tipo lanchonete|sorveteria|restaurante] [--mesas 15]
const { conectar, sistema, encerrar } = require('../db');
const { criarRestaurante } = require('../lib/criarRestaurante');
const config = require('../config');
const tipos = require('../lib/tipos');

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1], i++;
  return o;
}

(async () => {
  const o = args();
  try {
    if (o.tipo && !tipos.valido(o.tipo)) throw new Error('Tipo inválido. Use lanchonete, sorveteria ou restaurante.');
    await conectar();
    const { rest } = await sistema(c => criarRestaurante(c, { nome: o.nome, slug: String(o.slug || '').toLowerCase(), email: o.email, senha: o.senha, nomeDono: o.dono || 'Dono', tipo: o.tipo, mesas: o.mesas != null ? Number(o.mesas) : tipos.TIPOS[tipos.tipoDe(o.tipo)].mesas }));
    const base = config.urlPublica || `http://localhost:${config.porta}`;
    console.log(`\nRestaurante criado: ${rest.nome} (${tipos.TIPOS[rest.tipo].nome.toLowerCase()})`);
    console.log(`Cardápio (delivery): ${base}/r/${rest.slug}`);
    console.log(`Painel: ${base}/painel  (entre com ${o.email})`);
    console.log('Os QR Codes das mesas e o link do totem ficam no painel, aba "Mesas, QR e totem" (o dono pode adicionar mesas; trocar códigos e remover mesas é na área de devs).\n');
  } catch (e) { console.error('Não foi possível criar:', e.message); process.exitCode = 1; }
  await encerrar();
})();
