// Histórico, balanço financeiro e mapa de calor das mesas (só o dono).
// As somas e agrupamentos são feitos pelo PostgreSQL, sempre dentro do restaurante logado.
const express = require('express');
const { doRestaurante } = require('../db');
const { exigir } = require('../middleware/auth');
const { ErroApp, rota, texto, numero } = require('../lib/util');

const r = express.Router();
const dono = exigir('dono');
const PERIODOS = { hoje: 0, '7': 6, '30': 29 };

// Início do período no fuso do restaurante (null = desde sempre)
function inicioSql(periodo) {
  if (periodo === 'tudo') return { sql: "'-infinity'::timestamptz", dias: null };
  const d = PERIODOS[periodo]; if (d == null) throw new ErroApp(400, 'Período inválido.');
  return { sql: `(date_trunc('day', now() AT TIME ZONE r.fuso) - interval '${d} days') AT TIME ZONE r.fuso`, dias: d };
}
const premissasDe = r => ({ cmv: r.fin_cmv, cartao: r.fin_cartao, pix: r.fin_pix, rep: r.fin_repasse, emb: r.fin_embalagem, entreg: r.fin_entrega });

r.get('/relatorios', dono, rota(async (req, res) => {
  const periodo = texto(req.query.periodo, 5) || '7';
  const ini = inicioSql(periodo);
  const out = await doRestaurante(req.rid, async c => {
    const rest = (await c.query('SELECT * FROM restaurantes WHERE id = $1', [req.rid])).rows[0];
    const base = `FROM pedidos p JOIN restaurantes r ON r.id = p.restaurante_id WHERE p.restaurante_id = $1 AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= ${ini.sql}`;
    const canais = (await c.query(`SELECT CASE WHEN p.tipo = 'delivery' THEN 'delivery' ELSE 'rest' END AS canal, count(*)::int AS n,
        coalesce(sum(p.subtotal),0) AS prod, coalesce(sum(p.servico),0) AS serv, coalesce(sum(p.taxa_entrega),0) AS ent, coalesce(sum(p.total),0) AS total,
        coalesce(sum(p.total) FILTER (WHERE p.pag_metodo = 'pix'),0) AS tot_pix,
        coalesce(sum(p.total) FILTER (WHERE p.pag_metodo IN ('cartao','local')),0) AS tot_cartao,
        coalesce(sum(p.total) FILTER (WHERE p.pag_metodo = 'dinheiro'),0) AS tot_dinheiro,
        count(*) FILTER (WHERE p.pag_metodo = 'pix')::int AS n_pix
      ${base} GROUP BY 1`, [req.rid])).rows;
    const vazio = { n: 0, prod: 0, serv: 0, ent: 0, total: 0, tot_pix: 0, tot_cartao: 0, tot_dinheiro: 0, n_pix: 0 };
    const porCanal = { rest: Object.assign({}, vazio), delivery: Object.assign({}, vazio) };
    canais.forEach(x => { porCanal[x.canal] = x; delete x.canal; });
    const hora = periodo === 'hoje';
    const serie = (await c.query(`SELECT ${hora ? "extract(hour FROM p.criado_em AT TIME ZONE r.fuso)::int" : "to_char(p.criado_em AT TIME ZONE r.fuso, 'YYYY-MM-DD')"} AS chave,
        coalesce(sum(p.total) FILTER (WHERE p.tipo <> 'delivery'),0) AS r, coalesce(sum(p.total) FILTER (WHERE p.tipo = 'delivery'),0) AS d, count(*)::int AS n
      ${base} GROUP BY 1 ORDER BY 1`, [req.rid])).rows;
    const top = (await c.query(`SELECT i.nome, sum(i.qtd)::int AS q, sum(i.qtd * i.unit) AS v FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN restaurantes r ON r.id = p.restaurante_id
      WHERE p.restaurante_id = $1 AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= ${ini.sql} GROUP BY i.nome ORDER BY q DESC, v DESC LIMIT 8`, [req.rid])).rows;
    const mesas = (await c.query(`SELECT m.numero, coalesce(x.n,0)::int AS n, coalesce(x.v,0) AS v FROM
        (SELECT numero FROM mesas WHERE restaurante_id = $1 UNION SELECT DISTINCT mesa FROM pedidos WHERE restaurante_id = $1 AND tipo = 'mesa' AND mesa IS NOT NULL) m
      LEFT JOIN (SELECT p.mesa, count(*) AS n, sum(p.total) AS v ${base} AND p.tipo = 'mesa' GROUP BY p.mesa) x ON x.mesa = m.numero ORDER BY m.numero`, [req.rid])).rows;
    const lim = (await c.query(`SELECT ${ini.sql} AS inicio, now() AS fim, (SELECT min(criado_em) FROM pedidos WHERE restaurante_id = $1) AS primeiro FROM restaurantes r WHERE r.id = $1`, [req.rid])).rows[0];
    return { periodo, granularidade: hora ? 'hora' : 'dia', inicio: ini.dias == null ? lim.primeiro : lim.inicio, fim: lim.fim, fuso: rest.fuso,
      premissas: premissasDe(rest), canais: porCanal, serie, top, mesas, recursoMesa: rest.rec_mesa };
  });
  res.json(out);
}));

r.get('/historico', dono, rota(async (req, res) => {
  const periodo = texto(req.query.periodo, 5) || '7', ini = inicioSql(periodo);
  const canal = ['rest', 'delivery'].includes(req.query.canal) ? req.query.canal : 'todos';
  const q = texto(req.query.q, 60), limite = Math.min(100, Math.max(1, Math.trunc(numero(req.query.limite, 25)))), pular = Math.max(0, Math.trunc(numero(req.query.pular, 0)));
  const out = await doRestaurante(req.rid, async c => {
    const cond = [`p.restaurante_id = $1`, `p.criado_em >= ${ini.sql}`, `p.status <> 'aguardando'`], vals = [req.rid];
    if (canal === 'delivery') cond.push("p.tipo = 'delivery'"); else if (canal === 'rest') cond.push("p.tipo <> 'delivery'");
    if (q) {
      const n = q.replace(/\D/g, '');
      vals.push('%' + q.toLowerCase() + '%');
      const like = '$' + vals.length;
      const ors = [`lower(p.cliente_nome) LIKE ${like}`, `lower(coalesce(p.entrega_bairro,'')) LIKE ${like}`];
      if (n) { vals.push(Number(n)); ors.push('p.numero = $' + vals.length, `(p.tipo = 'mesa' AND p.mesa = $${vals.length})`); }
      cond.push('(' + ors.join(' OR ') + ')');
    }
    const where = `FROM pedidos p JOIN restaurantes r ON r.id = p.restaurante_id WHERE ${cond.join(' AND ')}`;
    const tot = (await c.query(`SELECT count(*)::int AS n, coalesce(sum(p.total) FILTER (WHERE p.status NOT IN ('cancelado', 'aguardando')),0) AS v ${where}`, vals)).rows[0];
    const contagem = (await c.query(`SELECT count(*)::int AS todos, count(*) FILTER (WHERE p.tipo <> 'delivery')::int AS rest, count(*) FILTER (WHERE p.tipo = 'delivery')::int AS delivery FROM pedidos p JOIN restaurantes r ON r.id = p.restaurante_id WHERE p.restaurante_id = $1 AND p.status <> 'aguardando' AND p.criado_em >= ${ini.sql}`, [req.rid])).rows[0];
    vals.push(limite, pular);
    const lista = (await c.query(`SELECT p.id, p.numero, p.tipo, p.mesa, p.cliente_nome, p.entrega_bairro, p.total, p.pag_metodo, p.pag_pago, p.status, p.criado_em,
        (SELECT coalesce(sum(qtd),0)::int FROM pedido_itens i WHERE i.pedido_id = p.id) AS itens
      ${where} ORDER BY p.criado_em DESC LIMIT $${vals.length - 1} OFFSET $${vals.length}`, vals)).rows;
    return { total: tot.n, valor: tot.v, contagem, pedidos: lista.map(p => ({ id: p.id, numero: p.numero, tipo: p.tipo, mesa: p.mesa, cliente: { nome: p.cliente_nome }, entrega: p.entrega_bairro ? { bairro: p.entrega_bairro } : undefined,
      total: p.total, pagamento: { metodo: p.pag_metodo, pago: p.pag_pago }, status: p.status, itens: p.itens, createdAt: p.criado_em })) };
  });
  res.json(out);
}));

r.put('/financeiro', dono, rota(async (req, res) => {
  const b = req.body || {}, lim = (v, max) => Math.min(max, Math.max(0, numero(v, 0)));
  const vals = [req.rid, lim(b.cmv, 100), lim(b.cartao, 20), lim(b.pix, 20), lim(b.rep, 100), lim(b.emb, 1000), lim(b.entreg, 1000)];
  const r2 = await doRestaurante(req.rid, async c => (await c.query('UPDATE restaurantes SET fin_cmv=$2, fin_cartao=$3, fin_pix=$4, fin_repasse=$5, fin_embalagem=$6, fin_entrega=$7 WHERE id=$1 RETURNING *', vals)).rows[0]);
  res.json({ premissas: premissasDe(r2) });
}));

module.exports = r;
