// Vitrine pública do ChefOnline: restaurantes listados, pratos, destaques e avaliações recentes
const express = require('express');
const { sistema } = require('../db');
const { recursosDe } = require('../lib/recursos');
const { tiposPermitidos, metodosPermitidos } = require('../lib/pedidos');
const { rota, estaAberto } = require('../lib/util');
const repo = require('../lib/repo');

const r = express.Router();
const primeiroNome = n => { const p = String(n || '').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };

r.get('/', rota(async (req, res) => {
  const out = await sistema(async c => {
    const rows = (await c.query(`SELECT r.*, a.media, a.qtd FROM restaurantes r
      LEFT JOIN (SELECT restaurante_id, round(avg(nota)::numeric, 1) AS media, count(*)::int AS qtd FROM avaliacoes GROUP BY restaurante_id) a ON a.restaurante_id = r.id
      WHERE r.ativo AND r.rec_vitrine ORDER BY coalesce(a.media, 0) DESC, r.nome`)).rows;
    const restaurantes = [];
    for (const row of rows) {
      const bairros = (await c.query('SELECT nome, taxa FROM bairros WHERE restaurante_id = $1 ORDER BY ordem, nome', [row.id])).rows;
      const rest = repo.restObj(row, bairros);
      const tipos = tiposPermitidos(rest).filter(t => t !== 'mesa');
      if (!tipos.length) continue; // sem entrega nem retirada, não aparece na vitrine
      restaurantes.push({ row, rest, tipos });
    }
    const ids = restaurantes.map(x => x.rest.id);
    const pratos = ids.length ? (await c.query('SELECT * FROM produtos WHERE restaurante_id = ANY($1) AND NOT esgotado ORDER BY destaque DESC, ordem, criado_em', [ids])).rows : [];
    const avs = ids.length ? (await c.query(`SELECT a.nota, a.comentario, a.criado_em, COALESCE(cl.nome, p.cliente_nome) AS nome, a.restaurante_id FROM avaliacoes a
      JOIN pedidos p ON p.id = a.pedido_id LEFT JOIN clientes cl ON cl.id = a.cliente_id
      WHERE a.restaurante_id = ANY($1) AND length(a.comentario) >= 10 ORDER BY a.criado_em DESC LIMIT 10`, [ids])).rows : [];
    const slugDe = new Map(restaurantes.map(x => [x.rest.id, x.rest.slug]));
    return {
      restaurantes: restaurantes.filter(({ rest }) => pratos.some(p => p.restaurante_id === rest.id)).map(({ row, rest, tipos }) => {
        const meus = pratos.filter(p => p.restaurante_id === rest.id);
        const taxas = rest.delivery.bairros.map(b => b.taxa);
        return { slug: rest.slug, nome: rest.nome, categoria: rest.categoriaVitrine || 'Restaurante', frase: rest.frase, sobre: rest.sobre || rest.frase, cor: rest.cor,
          capaUrl: rest.capaUrl || (meus.find(p => p.foto_url) || {}).foto_url || '', logoUrl: rest.logoUrl,
          nota: row.media, avaliacoes: row.qtd || 0, aberto: estaAberto(rest) || rest.aceitarForaDoHorario, abre: rest.abre, fecha: rest.fecha,
          tipos, pagamentos: { delivery: metodosPermitidos(rest, 'delivery'), retirada: metodosPermitidos(rest, 'retirada') },
          tempo: rest.delivery.tempo, tempoRetirada: rest.delivery.tempoRetirada, pedidoMinimo: rest.delivery.pedidoMinimo, gratisAcimaDe: rest.delivery.gratisAcimaDe,
          taxaMin: taxas.length ? Math.min(...taxas) : 0, bairros: rest.delivery.bairros, categorias: rest.categorias, chavePix: rest.chavePix,
          aPartirDe: meus.length ? Math.min(...meus.map(p => p.preco)) : null };
      }),
      pratos: pratos.map(p => ({ id: p.id, slug: slugDe.get(p.restaurante_id), categoria: p.categoria, nome: p.nome, descricao: p.descricao, preco: p.preco, fotoUrl: p.foto_url, destaque: p.destaque, temOpcoes: (p.opcoes || []).length > 0 })),
      avaliacoes: avs.map(a => ({ nome: primeiroNome(a.nome || 'Cliente'), nota: a.nota, comentario: a.comentario, slug: slugDe.get(a.restaurante_id), em: a.criado_em }))
    };
  });
  res.set('Cache-Control', 'public, max-age=30');
  res.json(out);
}));

module.exports = r;
