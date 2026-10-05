const { mascararCpf } = require('./util');
// Consultas ao banco e conversão das linhas do PostgreSQL para o formato que as telas usam.
// Todas as funções recebem "c": a conexão da transação aberta por doRestaurante() ou sistema().

/* ---------- restaurantes ---------- */
function restObj(r, bairros) {
  if (!r) return null;
  return {
    id: r.id, _id: r.id, nome: r.nome, slug: r.slug, frase: r.frase, cor: r.cor, logoUrl: r.logo_url, whatsapp: r.whatsapp, chavePix: r.chave_pix,
    fuso: r.fuso, abre: r.abre, fecha: r.fecha, aceitarForaDoHorario: r.aceitar_fora_horario, taxaServico: r.taxa_servico, categorias: r.categorias || [],
    delivery: { ativo: r.delivery_ativo, tempo: r.delivery_tempo, tempoRetirada: r.retirada_tempo, pedidoMinimo: r.pedido_minimo, gratisAcimaDe: r.gratis_acima_de, bairros: (bairros || []).map(b => ({ nome: b.nome, taxa: b.taxa })) },
    ativo: r.ativo, plano: r.plano, observacoes: r.observacoes, motivoSuspensao: r.motivo_suspensao,
    recursos: { mesa: r.rec_mesa, chamados: r.rec_chamados, retirada: r.rec_retirada, delivery: r.rec_delivery, pix: r.rec_pix, cartao: r.rec_cartao, dinheiro: r.rec_dinheiro, vitrine: r.rec_vitrine, online: r.rec_online },
    categoriaVitrine: r.categoria_vitrine || '', capaUrl: r.capa_url || '', sobre: r.sobre || '',
    createdAt: r.criado_em
  };
}
async function carregarRest(c, id) {
  const r = (await c.query('SELECT * FROM restaurantes WHERE id = $1', [id])).rows[0];
  if (!r) return null;
  const b = (await c.query('SELECT nome, taxa FROM bairros WHERE restaurante_id = $1 ORDER BY ordem, nome', [id])).rows;
  return restObj(r, b);
}
async function restPorSlug(c, slug) {
  const r = (await c.query('SELECT id FROM restaurantes WHERE slug = $1', [slug])).rows[0];
  return r ? carregarRest(c, r.id) : null;
}

// Grava as configurações (formato de limparConfig) nas colunas
const COLUNAS_CONFIG = { categoriaVitrine: 'categoria_vitrine', capaUrl: 'capa_url', sobre: 'sobre', nome: 'nome', frase: 'frase', cor: 'cor', logoUrl: 'logo_url', whatsapp: 'whatsapp', chavePix: 'chave_pix', abre: 'abre', fecha: 'fecha', aceitarForaDoHorario: 'aceitar_fora_horario', taxaServico: 'taxa_servico', categorias: 'categorias' };
const COLUNAS_DELIVERY = { ativo: 'delivery_ativo', tempo: 'delivery_tempo', tempoRetirada: 'retirada_tempo', pedidoMinimo: 'pedido_minimo', gratisAcimaDe: 'gratis_acima_de' };
async function salvarConfig(c, id, mud) {
  const sets = [], vals = [];
  Object.keys(COLUNAS_CONFIG).forEach(k => { if (k in mud){ vals.push(mud[k]); sets.push(COLUNAS_CONFIG[k] + ' = $' + vals.length); } });
  if (mud.delivery) Object.keys(COLUNAS_DELIVERY).forEach(k => { if (k in mud.delivery){ vals.push(mud.delivery[k]); sets.push(COLUNAS_DELIVERY[k] + ' = $' + vals.length); } });
  if (sets.length){ vals.push(id); await c.query('UPDATE restaurantes SET ' + sets.join(', ') + ' WHERE id = $' + vals.length, vals); }
  if (mud.delivery && Array.isArray(mud.delivery.bairros)) await salvarBairros(c, id, mud.delivery.bairros);
}
async function salvarBairros(c, rid, bairros) {
  await c.query('DELETE FROM bairros WHERE restaurante_id = $1', [rid]);
  const vistos = new Set();
  let i = 0;
  for (const b of bairros) { const k = b.nome.toLowerCase(); if (vistos.has(k)) continue; vistos.add(k); await c.query('INSERT INTO bairros (restaurante_id, nome, taxa, ordem) VALUES ($1, $2, $3, $4)', [rid, b.nome, b.taxa, i++]); }
}
async function adicionarCategoria(c, rid, cat) {
  await c.query('UPDATE restaurantes SET categorias = array_append(categorias, $2) WHERE id = $1 AND NOT ($2 = ANY(categorias))', [rid, cat]);
}

/* ---------- produtos ---------- */
function produtoObj(p) {
  return { id: p.id, _id: p.id, categoria: p.categoria, nome: p.nome, descricao: p.descricao, preco: p.preco, selos: p.selos || [], opcoes: p.opcoes || [], fotoUrl: p.foto_url, esgotado: p.esgotado, destaque: p.destaque, ordem: p.ordem, createdAt: p.criado_em };
}
async function listarProdutos(c, rid) {
  return (await c.query('SELECT * FROM produtos WHERE restaurante_id = $1 ORDER BY categoria, ordem, criado_em', [rid])).rows.map(produtoObj);
}
async function criarProduto(c, rid, d) {
  const r = await c.query('INSERT INTO produtos (restaurante_id, categoria, nome, descricao, preco, selos, opcoes, foto_url, esgotado, destaque) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [rid, d.categoria, d.nome, d.descricao, d.preco, d.selos, JSON.stringify(d.opcoes), d.fotoUrl, d.esgotado, d.destaque]);
  return produtoObj(r.rows[0]);
}
async function atualizarProduto(c, rid, id, d) {
  const r = await c.query('UPDATE produtos SET categoria=$3, nome=$4, descricao=$5, preco=$6, selos=$7, opcoes=$8, foto_url=$9, esgotado=$10, destaque=$11 WHERE id=$1 AND restaurante_id=$2 RETURNING *',
    [id, rid, d.categoria, d.nome, d.descricao, d.preco, d.selos, JSON.stringify(d.opcoes), d.fotoUrl, d.esgotado, d.destaque]);
  return r.rows[0] ? produtoObj(r.rows[0]) : null;
}
async function ajustarProduto(c, rid, id, mud) {
  const sets = [], vals = [id, rid];
  if ('preco' in mud){ vals.push(mud.preco); sets.push('preco = $' + vals.length); }
  if ('esgotado' in mud){ vals.push(mud.esgotado); sets.push('esgotado = $' + vals.length); }
  if ('destaque' in mud){ vals.push(mud.destaque); sets.push('destaque = $' + vals.length); }
  const q = sets.length ? 'UPDATE produtos SET ' + sets.join(', ') + ' WHERE id=$1 AND restaurante_id=$2 RETURNING *' : 'SELECT * FROM produtos WHERE id=$1 AND restaurante_id=$2';
  const r = await c.query(q, vals);
  return r.rows[0] ? produtoObj(r.rows[0]) : null;
}
async function buscarProduto(c, rid, id) {
  const r = await c.query('SELECT * FROM produtos WHERE id=$1 AND restaurante_id=$2', [id, rid]);
  return r.rows[0] ? produtoObj(r.rows[0]) : null;
}

/* ---------- pessoas ---------- */
const usuarioPublico = u => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo });

/* ---------- pedidos ---------- */
function pedidoObj(p, linhas, hist, opc) {
  return {
    _id: p.id, id: p.id, numero: p.numero, tipo: p.tipo, mesa: p.mesa, status: p.status,
    cliente: { nome: p.cliente_nome, tel: p.cliente_tel, cpf: opc && opc.cpfCompleto ? p.cliente_cpf || '' : mascararCpf(p.cliente_cpf) },
    entrega: p.tipo === 'delivery' ? { endereco: p.entrega_endereco, complemento: p.entrega_complemento || '', referencia: p.entrega_referencia || '', bairro: p.entrega_bairro } : undefined,
    linhas: (linhas || []).map(l => ({ produto: l.produto_id, nome: l.nome, qtd: l.qtd, unit: l.unit, opcoes: l.opcoes || [] })),
    obs: p.obs, subtotal: p.subtotal, servico: p.servico, taxaEntrega: p.taxa_entrega, total: p.total,
    pagamento: { metodo: p.pag_metodo, troco: p.pag_troco, pago: p.pag_pago, online: p.pag_metodo === 'online' ? (p.pag_status || 'pendente') : undefined },
    entregador: p.entregador_nome ? { id: p.entregador_id, nome: p.entregador_nome } : undefined,
    historico: (hist || []).map(h => ({ status: h.status, em: h.em, por: h.por })),
    clienteId: p.cliente_id || null, createdAt: p.criado_em, criadoEm: p.criado_em
  };
}
// Recebe linhas da tabela pedidos e devolve os pedidos completos (itens + histórico)
async function completarPedidos(c, rows, opc) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const itens = (await c.query('SELECT * FROM pedido_itens WHERE pedido_id = ANY($1) ORDER BY ordem', [ids])).rows;
  const hist = (await c.query('SELECT * FROM pedido_historico WHERE pedido_id = ANY($1) ORDER BY em, id', [ids])).rows;
  const por = (lista, id) => lista.filter(x => x.pedido_id === id);
  return rows.map(r => pedidoObj(r, por(itens, r.id), por(hist, r.id), opc));
}
async function buscarPedido(c, rid, id) {
  const r = (await c.query('SELECT * FROM pedidos WHERE id = $1 AND restaurante_id = $2', [id, rid])).rows;
  return r[0] ? { row: r[0], obj: (await completarPedidos(c, r))[0] } : null;
}
async function criarPedido(c, rid, d) {
  const num = (await c.query('UPDATE restaurantes SET seq_pedido = seq_pedido + 1 WHERE id = $1 RETURNING seq_pedido', [rid])).rows[0].seq_pedido;
  const e = d.entrega || {};
  const p = (await c.query(`INSERT INTO pedidos (restaurante_id, numero, tipo, mesa, cliente_nome, cliente_tel, entrega_endereco, entrega_complemento, entrega_referencia, entrega_bairro,
      obs, subtotal, servico, taxa_entrega, total, pag_metodo, pag_troco, codigo_acomp, cliente_id, cliente_cpf, status, pag_status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
    [rid, num, d.tipo, d.mesa, d.cliente.nome, d.cliente.tel, d.entrega ? e.endereco : null, d.entrega ? e.complemento : null, d.entrega ? e.referencia : null, d.entrega ? e.bairro : null,
      d.obs, d.subtotal, d.servico, d.taxaEntrega, d.total, d.pagamento.metodo, d.pagamento.troco, d.codigoAcomp, d.clienteId || null, d.cliente.cpf || null, d.status || 'novo', d.pagamento.metodo === 'online' ? 'pendente' : null])).rows[0];
  let i = 0;
  for (const l of d.linhas) await c.query('INSERT INTO pedido_itens (pedido_id, restaurante_id, produto_id, nome, qtd, unit, opcoes, ordem) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [p.id, rid, l.produto, l.nome, l.qtd, l.unit, l.opcoes, i++]);
  await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1,$2,$3,$4)', [p.id, rid, p.status, 'cliente']);
  return { row: p, obj: (await completarPedidos(c, [p]))[0] };
}

module.exports = { restObj, carregarRest, restPorSlug, salvarConfig, salvarBairros, adicionarCategoria, produtoObj, listarProdutos, criarProduto, atualizarProduto, ajustarProduto, buscarProduto, usuarioPublico, pedidoObj, completarPedidos, buscarPedido, criarPedido };
