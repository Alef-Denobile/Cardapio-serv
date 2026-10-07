// Histórico, balanço financeiro e mapa de calor das mesas (só o dono).
// As somas e agrupamentos são feitos pelo PostgreSQL, sempre dentro do restaurante logado.
const express = require('express');
const { doRestaurante } = require('../db');
const { exigir } = require('../middleware/auth');
const { ErroApp, rota, texto, numero } = require('../lib/util');
const notas = require('../lib/notas');

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
        coalesce(sum(p.total) FILTER (WHERE p.pag_metodo IN ('cartao','local','online')),0) AS tot_cartao,
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
    // Lucro por prato: só itens vendidos com ficha técnica (custo gravado na hora da venda)
    const lucro = (await c.query(`SELECT i.nome, sum(i.qtd)::int AS q, sum(i.qtd * i.unit) AS receita, sum(i.qtd * i.custo) AS custo
      FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN restaurantes r ON r.id = p.restaurante_id
      WHERE p.restaurante_id = $1 AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= ${ini.sql} AND i.custo IS NOT NULL
      GROUP BY i.nome ORDER BY sum(i.qtd * (i.unit - i.custo)) DESC LIMIT 30`, [req.rid])).rows
      .map(x => ({ nome: x.nome, q: x.q, receita: Math.round(x.receita * 100) / 100, custo: Math.round(x.custo * 100) / 100, lucro: Math.round((x.receita - x.custo) * 100) / 100, margem: x.receita ? Math.round((x.receita - x.custo) / x.receita * 1000) / 10 : 0 }));
    const semFicha = (await c.query(`SELECT count(DISTINCT i.nome)::int AS n FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN restaurantes r ON r.id = p.restaurante_id
      WHERE p.restaurante_id = $1 AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= ${ini.sql} AND i.custo IS NULL`, [req.rid])).rows[0].n;
    const mesas = (await c.query(`SELECT m.numero, coalesce(x.n,0)::int AS n, coalesce(x.v,0) AS v FROM
        (SELECT numero FROM mesas WHERE restaurante_id = $1 UNION SELECT DISTINCT mesa FROM pedidos WHERE restaurante_id = $1 AND tipo = 'mesa' AND mesa IS NOT NULL) m
      LEFT JOIN (SELECT p.mesa, count(*) AS n, sum(p.total) AS v ${base} AND p.tipo = 'mesa' GROUP BY p.mesa) x ON x.mesa = m.numero ORDER BY m.numero`, [req.rid])).rows;
    const lim = (await c.query(`SELECT ${ini.sql} AS inicio, now() AS fim, (SELECT min(criado_em) FROM pedidos WHERE restaurante_id = $1) AS primeiro FROM restaurantes r WHERE r.id = $1`, [req.rid])).rows[0];
    return { periodo, granularidade: hora ? 'hora' : 'dia', inicio: ini.dias == null ? lim.primeiro : lim.inicio, fim: lim.fim, fuso: rest.fuso,
      premissas: premissasDe(rest), canais: porCanal, serie, top, lucro, semFicha, mesas, recursoMesa: rest.rec_mesa };
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
    const ns = await notas.notasDosPedidos(c, req.rid, lista.map(p => p.id));
    return { total: tot.n, valor: tot.v, contagem, pedidos: lista.map(p => ({ nota: ns.get(p.id) || null, id: p.id, numero: p.numero, tipo: p.tipo, mesa: p.mesa, cliente: { nome: p.cliente_nome }, entrega: p.entrega_bairro ? { bairro: p.entrega_bairro } : undefined,
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

// Exporta o período para Excel (.xlsx): resumo, pedidos, itens e mais vendidos
const ExcelJS = require('exceljs');
const STATUS_TXT = { novo: 'Novo', preparo: 'Em preparo', pronto: 'Pronto', rota: 'Saiu para entrega', entregue: 'Finalizado', cancelado: 'Cancelado' };
const TIPO_TXT = { mesa: 'Mesa', retirada: 'Retirada', delivery: 'Delivery' };
const PAG_TXT = { online: 'Pago pelo site', pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', local: 'No local' };
const dataLocal = t => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(t || ''); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) : null; };
const MOEDA = '"R$" #,##0.00';

r.get('/exportar', dono, rota(async (req, res) => {
  const periodo = texto(req.query.periodo, 5) || '30', ini = inicioSql(periodo);
  const d = await doRestaurante(req.rid, async c => {
    const rest = (await c.query('SELECT nome, slug, fuso FROM restaurantes WHERE id = $1', [req.rid])).rows[0];
    const base = `FROM pedidos p JOIN restaurantes r ON r.id = p.restaurante_id WHERE p.restaurante_id = $1 AND p.status <> 'aguardando' AND p.criado_em >= ${ini.sql}`;
    const pedidos = (await c.query(`SELECT p.id, p.numero, to_char(p.criado_em AT TIME ZONE r.fuso, 'YYYY-MM-DD HH24:MI') AS quando, p.tipo, p.mesa, p.cliente_nome, p.cliente_tel, p.entrega_bairro,
        p.status, p.pag_metodo, p.pag_pago, p.subtotal, p.servico, p.taxa_entrega, p.total, p.entregador_nome ${base} ORDER BY p.criado_em LIMIT 50000`, [req.rid])).rows;
    const itens = (await c.query(`SELECT p.numero, to_char(p.criado_em AT TIME ZONE r.fuso, 'YYYY-MM-DD HH24:MI') AS quando, p.status, i.nome, i.opcoes, i.qtd, i.unit
      FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN restaurantes r ON r.id = p.restaurante_id
      WHERE p.restaurante_id = $1 AND p.status <> 'aguardando' AND p.criado_em >= ${ini.sql} ORDER BY p.criado_em, i.ordem LIMIT 200000`, [req.rid])).rows;
    const lim = (await c.query(`SELECT to_char(greatest(${ini.sql}, (SELECT min(criado_em) FROM pedidos WHERE restaurante_id = $1)) AT TIME ZONE r.fuso, 'DD/MM/YYYY') AS de, to_char(now() AT TIME ZONE r.fuso, 'DD/MM/YYYY HH24:MI') AS ate FROM restaurantes r WHERE r.id = $1`, [req.rid])).rows[0];
    return { rest, pedidos, itens, lim };
  });

  const wb = new ExcelJS.Workbook(); wb.creator = 'Cardápio Digital'; wb.created = new Date();
  const ws = wb.addWorksheet('Resumo'); // primeira aba; preenchida no fim
  const cab = (ws, cols) => { ws.columns = cols; const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5D46' } }; h.alignment = { vertical: 'middle' }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };

  // Pedidos
  const wp = wb.addWorksheet('Pedidos');
  cab(wp, [{ header: 'Nº', key: 'n', width: 8 }, { header: 'Data e hora', key: 'q', width: 17, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { header: 'Canal', key: 'canal', width: 13 }, { header: 'Tipo', key: 't', width: 10 },
    { header: 'Mesa', key: 'm', width: 7 }, { header: 'Cliente', key: 'cl', width: 22 }, { header: 'Telefone', key: 'tel', width: 16 }, { header: 'Bairro', key: 'b', width: 16 }, { header: 'Status', key: 's', width: 16 },
    { header: 'Pagamento', key: 'pg', width: 15 }, { header: 'Pago', key: 'pago', width: 7 }, { header: 'Produtos', key: 'sub', width: 12, style: { numFmt: MOEDA } }, { header: 'Serviço', key: 'serv', width: 11, style: { numFmt: MOEDA } },
    { header: 'Entrega', key: 'ent', width: 11, style: { numFmt: MOEDA } }, { header: 'Total', key: 'tot', width: 12, style: { numFmt: MOEDA } }, { header: 'Entregador', key: 'eg', width: 16 }]);
  d.pedidos.forEach(p => wp.addRow({ n: p.numero, q: dataLocal(p.quando), canal: p.tipo === 'delivery' ? 'Delivery' : 'Restaurante', t: TIPO_TXT[p.tipo], m: p.mesa || null, cl: p.cliente_nome, tel: p.cliente_tel || '', b: p.entrega_bairro || '',
    s: STATUS_TXT[p.status] || p.status, pg: PAG_TXT[p.pag_metodo] || p.pag_metodo, pago: p.pag_pago ? 'Sim' : 'Não', sub: p.subtotal, serv: p.servico, ent: p.taxa_entrega, tot: p.total, eg: p.entregador_nome || '' }));
  const ult = Math.max(2, d.pedidos.length + 1);
  if (d.pedidos.length) wp.autoFilter = { from: 'A1', to: 'P1' };

  // Itens
  const wi = wb.addWorksheet('Itens');
  cab(wi, [{ header: 'Nº pedido', key: 'n', width: 10 }, { header: 'Data e hora', key: 'q', width: 17, style: { numFmt: 'dd/mm/yyyy hh:mm' } }, { header: 'Status', key: 's', width: 16 }, { header: 'Produto', key: 'p', width: 28 },
    { header: 'Opções', key: 'o', width: 26 }, { header: 'Qtd', key: 'qt', width: 6 }, { header: 'Preço unitário', key: 'u', width: 14, style: { numFmt: MOEDA } }, { header: 'Total', key: 't', width: 12, style: { numFmt: MOEDA } }]);
  d.itens.forEach((i, k) => { const row = wi.addRow({ n: i.numero, q: dataLocal(i.quando), s: STATUS_TXT[i.status] || i.status, p: i.nome, o: (i.opcoes || []).join(', '), qt: i.qtd, u: i.unit });
    row.getCell('t').value = { formula: `F${k + 2}*G${k + 2}`, result: Math.round(i.qtd * i.unit * 100) / 100 }; });
  if (d.itens.length) wi.autoFilter = { from: 'A1', to: 'H1' };

  // Mais vendidos (sem cancelados)
  const top = new Map();
  d.itens.filter(i => i.status !== 'cancelado').forEach(i => { const x = top.get(i.nome) || { q: 0, v: 0 }; x.q += i.qtd; x.v += i.qtd * i.unit; top.set(i.nome, x); });
  const wt = wb.addWorksheet('Mais vendidos');
  cab(wt, [{ header: 'Produto', key: 'p', width: 30 }, { header: 'Quantidade', key: 'q', width: 12 }, { header: 'Valor vendido', key: 'v', width: 15, style: { numFmt: MOEDA } }]);
  [...top.entries()].sort((a, b) => b[1].q - a[1].q).forEach(([p, x]) => wt.addRow({ p, q: x.q, v: Math.round(x.v * 100) / 100 }));

  // Resumo (fórmulas sobre a aba Pedidos, para o contador conferir)
  ws.columns = [{ width: 34 }, { width: 18 }];
  ws.addRow([d.rest.nome]).font = { bold: true, size: 14 };
  ws.addRow(['Período', d.lim.de ? d.lim.de + ' a ' + d.lim.ate : 'Sem pedidos']);
  ws.addRow(['Pedidos cancelados não entram nos totais.']).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([]);
  const val = (rotulo, formula, result, moeda) => { const row = ws.addRow([rotulo]); row.getCell(2).value = { formula, result }; if (moeda) row.getCell(2).numFmt = MOEDA; return row; };
  const ok = d.pedidos.filter(p => p.status !== 'cancelado'), soma = (l, k) => Math.round(l.reduce((a, p) => a + (+p[k] || 0), 0) * 100) / 100;
  const P = `Pedidos!`, R = (col) => `${P}${col}2:${col}${ult}`;
  val('Faturamento total', `SUMIFS(${R('O')},${R('I')},"<>Cancelado")`, soma(ok, 'total'), true).font = { bold: true };
  val('Pedidos', `COUNTIFS(${R('I')},"<>Cancelado",${R('A')},"<>")`, ok.length);
  val('Ticket médio', `IFERROR(B5/B6,0)`, ok.length ? Math.round(soma(ok, 'total') / ok.length * 100) / 100 : 0, true);
  ws.addRow([]);
  ws.addRow(['Por canal']).font = { bold: true };
  for (const [nome] of [['Restaurante'], ['Delivery']]) { const l = ok.filter(p => (p.tipo === 'delivery') === (nome === 'Delivery')); val('  ' + nome, `SUMIFS(${R('O')},${R('I')},"<>Cancelado",${R('C')},"${nome}")`, soma(l, 'total'), true); }
  ws.addRow([]);
  ws.addRow(['Por forma de pagamento']).font = { bold: true };
  for (const [k, nome] of Object.entries(PAG_TXT)) { const l = ok.filter(p => p.pag_metodo === k); if (!l.length) continue; val('  ' + nome, `SUMIFS(${R('O')},${R('I')},"<>Cancelado",${R('J')},"${nome}")`, soma(l, 'total'), true); }
  ws.addRow([]);
  ws.addRow(['Composição']).font = { bold: true };
  val('  Produtos', `SUMIFS(${R('L')},${R('I')},"<>Cancelado")`, soma(ok, 'subtotal'), true);
  val('  Taxa de serviço (mesa)', `SUMIFS(${R('M')},${R('I')},"<>Cancelado")`, soma(ok, 'servico'), true);
  val('  Taxas de entrega', `SUMIFS(${R('N')},${R('I')},"<>Cancelado")`, soma(ok, 'taxa_entrega'), true);

  const nomeArq = `pedidos-${d.rest.slug}-${periodo === 'tudo' ? 'tudo' : periodo === 'hoje' ? 'hoje' : periodo + 'dias'}.xlsx`;
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nomeArq}"`, 'Cache-Control': 'no-store' });
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = r;
