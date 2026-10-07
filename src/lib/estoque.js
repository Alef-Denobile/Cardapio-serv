// Estoque com ficha técnica: cada prato diz quanto usa de cada insumo.
// - Na venda, o estoque é baixado automaticamente (e devolvido se o pedido for cancelado).
// - Prato com algum insumo insuficiente sai do cardápio sozinho e volta quando o estoque é reposto.
// - O custo do prato (soma da ficha) fica gravado em cada item vendido, para o lucro por prato.
// Todas as funções recebem "c", uma conexão já no contexto do restaurante.
const { ErroApp } = require('./util');

const r3 = v => Math.round(v * 1000) / 1000;

async function fichasDe(c, rid, produtoIds) {
  const q = produtoIds
    ? await c.query('SELECT f.produto_id, f.insumo_id, f.qtd, i.nome, i.unidade, i.custo, i.estoque FROM ficha_tecnica f JOIN insumos i ON i.id = f.insumo_id WHERE f.restaurante_id = $1 AND f.produto_id = ANY($2::uuid[])', [rid, produtoIds])
    : await c.query('SELECT f.produto_id, f.insumo_id, f.qtd, i.nome, i.unidade, i.custo, i.estoque FROM ficha_tecnica f JOIN insumos i ON i.id = f.insumo_id WHERE f.restaurante_id = $1', [rid]);
  const m = new Map();
  q.rows.forEach(x => { if (!m.has(x.produto_id)) m.set(x.produto_id, []); m.get(x.produto_id).push(x); });
  return m;
}

// Custo e disponibilidade de cada prato que tem ficha técnica
async function resumoProdutos(c, rid) {
  const m = await fichasDe(c, rid), out = new Map();
  m.forEach((l, pid) => out.set(pid, {
    custo: Math.round(l.reduce((a, x) => a + x.qtd * x.custo, 0) * 100) / 100,
    semEstoque: l.filter(x => x.estoque < x.qtd).map(x => x.nome),
    ficha: l.map(x => ({ insumo: x.insumo_id, nome: x.nome, unidade: x.unidade, qtd: x.qtd, custo: x.custo }))
  }));
  return out;
}

// Confere e baixa o estoque de um pedido. linhas: [{ produto, nome, qtd }]. Devolve os alertas de estoque baixo.
async function baixar(c, rid, pedidoId, linhas, por) {
  const ids = [...new Set(linhas.map(l => l.produto))];
  const fichas = await fichasDe(c, rid, ids);
  if (!fichas.size) return [];
  const precisa = new Map(), usadoPor = new Map();
  linhas.forEach(l => (fichas.get(l.produto) || []).forEach(f => {
    precisa.set(f.insumo_id, r3((precisa.get(f.insumo_id) || 0) + f.qtd * l.qtd));
    if (!usadoPor.has(f.insumo_id)) usadoPor.set(f.insumo_id, l.nome);
  }));
  // trava as linhas dos insumos para dois pedidos ao mesmo tempo não venderem o mesmo estoque
  const ins = (await c.query('SELECT id, nome, unidade, estoque, minimo FROM insumos WHERE restaurante_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE', [rid, [...precisa.keys()]])).rows;
  for (const i of ins) {
    if (i.estoque < precisa.get(i.id)) throw new ErroApp(409, `${usadoPor.get(i.id)} acabou de esgotar. Remova do pedido para continuar.`);
  }
  const alertas = [];
  for (const i of ins) {
    const q = precisa.get(i.id), novo = r3(i.estoque - q);
    await c.query('UPDATE insumos SET estoque = $3 WHERE id = $1 AND restaurante_id = $2', [i.id, rid, novo]);
    await c.query("INSERT INTO estoque_mov (restaurante_id, insumo_id, delta, motivo, pedido_id, por) VALUES ($1,$2,$3,'venda',$4,$5)", [rid, i.id, -q, pedidoId, por || 'pedido']);
    if (novo <= i.minimo && i.estoque > i.minimo || novo <= 0 && i.estoque > 0) alertas.push({ id: i.id, nome: i.nome, unidade: i.unidade, estoque: novo, minimo: i.minimo, acabou: novo <= 0 });
  }
  return alertas;
}

// Pedido cancelado: devolve ao estoque o que a venda tinha baixado (uma vez só)
async function devolver(c, rid, pedidoId, por) {
  const rows = (await c.query('SELECT insumo_id, sum(delta) AS s FROM estoque_mov WHERE restaurante_id = $1 AND pedido_id = $2 GROUP BY insumo_id HAVING sum(delta) < 0', [rid, pedidoId])).rows;
  for (const x of rows) {
    await c.query('UPDATE insumos SET estoque = estoque + $3 WHERE id = $1 AND restaurante_id = $2', [x.insumo_id, rid, -x.s]);
    await c.query("INSERT INTO estoque_mov (restaurante_id, insumo_id, delta, motivo, pedido_id, por) VALUES ($1,$2,$3,'devolucao',$4,$5)", [rid, x.insumo_id, -x.s, pedidoId, por || 'cancelamento']);
  }
  return rows.length;
}

module.exports = { fichasDe, resumoProdutos, baixar, devolver };
