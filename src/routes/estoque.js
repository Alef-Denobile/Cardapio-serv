// Estoque e ficha técnica (área do restaurante).
// Dono: cadastra insumos, define custos e monta a ficha de cada prato. Cozinha: vê o estoque e lança entradas e perdas.
const express = require('express');
const { doRestaurante } = require('../db');
const { exigir } = require('../middleware/auth');
const { ErroApp, rota, texto, numero, uuidValido } = require('../lib/util');
const estoque = require('../lib/estoque');
const repo = require('../lib/repo');

const r = express.Router();
const dono = exigir('dono');
const cozinhaOuDono = exigir('dono', 'cozinha');
const UNIDADES = ['un', 'kg', 'g', 'l', 'ml'];
const r3 = v => Math.round(v * 1000) / 1000;

function limparInsumo(b, novo) {
  const nome = texto(b.nome, 60), unidade = UNIDADES.includes(b.unidade) ? b.unidade : 'un';
  if (!nome) throw new ErroApp(400, 'Dê um nome ao insumo (ex.: Mussarela).');
  const o = { nome, unidade, minimo: r3(Math.max(0, numero(b.minimo, 0))), custo: Math.round(Math.max(0, numero(b.custo, 0)) * 10000) / 10000 };
  if (novo) o.estoque = r3(Math.max(0, numero(b.estoque, 0)));
  return o;
}
const insumoObj = (i, uso) => ({ id: i.id, nome: i.nome, unidade: i.unidade, estoque: i.estoque, minimo: i.minimo, custo: i.custo, usadoEm: uso || 0, situacao: i.estoque <= 0 ? 'acabou' : i.estoque <= i.minimo ? 'baixo' : 'ok', atualizadoEm: i.atualizado_em });

r.get('/estoque', cozinhaOuDono, rota(async (req, res) => {
  const out = await doRestaurante(req.rid, async c => {
    const ins = (await c.query('SELECT i.*, (SELECT count(*)::int FROM ficha_tecnica f WHERE f.insumo_id = i.id) AS uso FROM insumos i WHERE i.restaurante_id = $1 ORDER BY i.nome', [req.rid])).rows;
    const prods = await repo.listarProdutos(c, req.rid), resumo = await estoque.resumoProdutos(c, req.rid);
    const dono = req.usuario.papel === 'dono';
    return {
      insumos: ins.map(i => Object.assign(insumoObj(i, i.uso), dono ? {} : { custo: undefined })),
      produtos: prods.map(p => { const x = resumo.get(p.id);
        return { id: p.id, nome: p.nome, categoria: p.categoria, preco: p.preco, esgotado: p.esgotado, temFicha: !!x, semEstoque: x ? x.semEstoque : [],
          custo: x && dono ? x.custo : null, lucro: x && dono ? Math.round((p.preco - x.custo) * 100) / 100 : null, margem: x && dono && p.preco ? Math.round((p.preco - x.custo) / p.preco * 1000) / 10 : null,
          ficha: x ? x.ficha.map(f => ({ insumo: f.insumo, nome: f.nome, unidade: f.unidade, qtd: f.qtd, custo: dono ? f.custo : undefined })) : [] }; })
    };
  });
  res.json(out);
}));

r.post('/insumos', dono, rota(async (req, res) => {
  const d = limparInsumo(req.body || {}, true);
  try {
    const i = await doRestaurante(req.rid, async c => {
      const i = (await c.query('INSERT INTO insumos (restaurante_id, nome, unidade, estoque, minimo, custo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.rid, d.nome, d.unidade, d.estoque, d.minimo, d.custo])).rows[0];
      if (d.estoque) await c.query("INSERT INTO estoque_mov (restaurante_id, insumo_id, delta, motivo, por) VALUES ($1,$2,$3,'entrada',$4)", [req.rid, i.id, d.estoque, req.usuario.nome]);
      return i;
    });
    res.status(201).json({ insumo: insumoObj(i) });
  } catch (e) { if (e.code === '23505') throw new ErroApp(409, 'Já existe um insumo com esse nome.'); throw e; }
}));

r.put('/insumos/:id', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Insumo não encontrado.');
  const d = limparInsumo(req.body || {}, false);
  try {
    const i = await doRestaurante(req.rid, async c => (await c.query('UPDATE insumos SET nome = $3, unidade = $4, minimo = $5, custo = $6 WHERE id = $1 AND restaurante_id = $2 RETURNING *', [req.params.id, req.rid, d.nome, d.unidade, d.minimo, d.custo])).rows[0]);
    if (!i) throw new ErroApp(404, 'Insumo não encontrado.');
    res.json({ insumo: insumoObj(i) });
  } catch (e) { if (e.code === '23505') throw new ErroApp(409, 'Já existe um insumo com esse nome.'); throw e; }
}));

r.delete('/insumos/:id', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Insumo não encontrado.');
  const n = await doRestaurante(req.rid, async c => (await c.query('DELETE FROM insumos WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rowCount);
  if (!n) throw new ErroApp(404, 'Insumo não encontrado.');
  res.json({ ok: true });
}));

// Entrada (compra), perda (estragou, caiu) ou ajuste (contagem do estoque)
r.post('/insumos/:id/movimento', cozinhaOuDono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Insumo não encontrado.');
  const b = req.body || {}, tipo = ['entrada', 'perda', 'ajuste'].includes(b.tipo) ? b.tipo : null;
  if (!tipo) throw new ErroApp(400, 'Escolha entrada, perda ou contagem.');
  const qtd = r3(numero(b.qtd, NaN));
  if (!(qtd >= 0) || (tipo !== 'ajuste' && !(qtd > 0))) throw new ErroApp(400, 'Informe a quantidade.');
  const custo = b.custo === undefined || b.custo === '' ? null : Math.round(Math.max(0, numero(b.custo, 0)) * 10000) / 10000;
  if (custo !== null && req.usuario.papel !== 'dono') throw new ErroApp(403, 'Só o dono altera o custo dos insumos.');
  const i = await doRestaurante(req.rid, async c => {
    const i = (await c.query('SELECT * FROM insumos WHERE id = $1 AND restaurante_id = $2 FOR UPDATE', [req.params.id, req.rid])).rows[0];
    if (!i) throw new ErroApp(404, 'Insumo não encontrado.');
    const delta = tipo === 'entrada' ? qtd : tipo === 'perda' ? -qtd : r3(qtd - i.estoque);
    const u = (await c.query('UPDATE insumos SET estoque = estoque + $3' + (custo !== null ? ', custo = $4' : '') + ' WHERE id = $1 AND restaurante_id = $2 RETURNING *', custo !== null ? [i.id, req.rid, delta, custo] : [i.id, req.rid, delta])).rows[0];
    if (delta) await c.query('INSERT INTO estoque_mov (restaurante_id, insumo_id, delta, motivo, por) VALUES ($1,$2,$3,$4,$5)', [req.rid, i.id, delta, tipo, req.usuario.nome]);
    return u;
  });
  res.json({ insumo: insumoObj(i) });
}));

r.get('/insumos/:id/movimentos', cozinhaOuDono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Insumo não encontrado.');
  const l = await doRestaurante(req.rid, async c => (await c.query(`SELECT m.delta, m.motivo, m.por, m.em, p.numero FROM estoque_mov m LEFT JOIN pedidos p ON p.id = m.pedido_id
    WHERE m.restaurante_id = $1 AND m.insumo_id = $2 ORDER BY m.em DESC, m.id DESC LIMIT 60`, [req.rid, req.params.id])).rows);
  res.json({ movimentos: l.map(m => ({ delta: m.delta, motivo: m.motivo, por: m.por, em: m.em, pedido: m.numero || null })) });
}));

// Ficha técnica de um prato: quanto ele usa de cada insumo
r.put('/produtos/:id/ficha', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Produto não encontrado.');
  const itens = (Array.isArray(req.body && req.body.itens) ? req.body.itens : []).slice(0, 40)
    .map(x => ({ insumo: String(x.insumo || ''), qtd: r3(numero(x.qtd, 0)) })).filter(x => uuidValido(x.insumo) && x.qtd > 0);
  const out = await doRestaurante(req.rid, async c => {
    if (!(await c.query('SELECT 1 FROM produtos WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rowCount) throw new ErroApp(404, 'Produto não encontrado.');
    await c.query('DELETE FROM ficha_tecnica WHERE produto_id = $1 AND restaurante_id = $2', [req.params.id, req.rid]);
    const vistos = new Set();
    for (const x of itens) {
      if (vistos.has(x.insumo)) continue; vistos.add(x.insumo);
      await c.query('INSERT INTO ficha_tecnica (restaurante_id, produto_id, insumo_id, qtd) VALUES ($1,$2,$3,$4)', [req.rid, req.params.id, x.insumo, x.qtd]);
    }
    return (await estoque.resumoProdutos(c, req.rid)).get(req.params.id) || { custo: null, semEstoque: [], ficha: [] };
  });
  res.json({ ficha: out.ficha, custo: out.custo, semEstoque: out.semEstoque });
}));

module.exports = r;
