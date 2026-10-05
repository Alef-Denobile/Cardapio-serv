// Rotas abertas: o que o cliente usa pelo link do delivery ou pelo QR da mesa.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { doRestaurante, sistema } = require('../db');
const repo = require('../lib/repo');
const { montarPedido, metodosPermitidos, tiposPermitidos, PAGO_NO_SITE } = require('../lib/pedidos');
const pagamentos = require('../lib/pagamentos');
const { recursosDe } = require('../lib/recursos');
const { ErroApp, rota, texto, numero, tokenAleatorio, iguais, estaAberto, uuidValido, pedidoParaCliente } = require('../lib/util');
const rt = require('../realtime');
const { clienteDoToken } = require('./clientes');

const r = express.Router();
const limitePedidos = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitos pedidos seguidos deste aparelho. Aguarde alguns minutos.' } });
const limiteChamados = rateLimit({ windowMs: 5 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { erro: 'Aguarde um pouco antes de chamar de novo.' } });

// Descobre o restaurante pelo endereço (única consulta pública feita fora do contexto de um restaurante)
async function carregar(slug) {
  const rest = await sistema(c => repo.restPorSlug(c, texto(slug, 60).toLowerCase()));
  if (!rest) throw new ErroApp(404, 'Restaurante não encontrado.');
  if (!rest.ativo) throw new ErroApp(403, 'Este restaurante está temporariamente indisponível.');
  return rest;
}

r.get('/r/:slug', rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  const produtos = await doRestaurante(rest.id, c => repo.listarProdutos(c, rest.id));
  const cats = rest.categorias.length ? rest.categorias : [...new Set(produtos.map(p => p.categoria))];
  res.json({
    restaurante: {
      nome: rest.nome, slug: rest.slug, frase: rest.frase, cor: rest.cor, logoUrl: rest.logoUrl, abre: rest.abre, fecha: rest.fecha,
      aberto: estaAberto(rest), aceitarForaDoHorario: rest.aceitarForaDoHorario, taxaServico: rest.taxaServico, chavePix: rest.chavePix, whatsapp: rest.whatsapp,
      delivery: rest.delivery, categorias: cats, recursos: recursosDe(rest), tipos: tiposPermitidos(rest),
      pagamentos: { mesa: metodosPermitidos(rest, 'mesa'), retirada: metodosPermitidos(rest, 'retirada'), delivery: metodosPermitidos(rest, 'delivery') }
    },
    produtos: produtos.map(p => ({ id: p.id, categoria: p.categoria, nome: p.nome, descricao: p.descricao, preco: p.preco, selos: p.selos, opcoes: p.opcoes, fotoUrl: p.fotoUrl, esgotado: p.esgotado, destaque: p.destaque }))
  });
}));

r.get('/r/:slug/mesa/:numero', rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  const m = await doRestaurante(rest.id, async c => (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = $2', [rest.id, Math.trunc(numero(req.params.numero))])).rows[0]);
  res.json({ valida: !!(recursosDe(rest).mesa && m && iguais(m.token, texto(req.query.t, 40))) });
}));

r.post('/r/:slug/pedidos', limitePedidos, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  const corpo = Object.assign({}, req.body || {});
  const pagaNoSite = PAGO_NO_SITE.includes(corpo.pagamento && corpo.pagamento.metodo);
  // Pagar pelo site exige conta de cliente; nos outros casos, a conta é ignorada (pedido sem cadastro)
  const cliente = pagaNoSite ? await clienteDoToken(req, true) : null;
  if (cliente) {
    if (!cliente.cpf || !cliente.telefone) throw new ErroApp(400, 'Complete seu CPF e WhatsApp na sua conta para pagar pelo site.');
    corpo.cliente = { nome: cliente.nome, tel: cliente.telefone };
  }
  const p = await doRestaurante(rest.id, async c => {
    const dados = await montarPedido(c, rest, corpo);
    dados.codigoAcomp = tokenAleatorio(12);
    if (cliente) { dados.clienteId = cliente.id; dados.cliente.cpf = cliente.cpf; }
    return repo.criarPedido(c, rest.id, dados);
  });
  let pagamento;
  if (p.row.status === 'aguardando') {
    pagamento = await pagamentos.provedor().iniciar(p.obj, p.row.codigo_acomp);
    await sistema(c => c.query('UPDATE pedidos SET pag_ref = $2 WHERE id = $1', [p.row.id, pagamento.ref]));
  } else rt.paraEquipe(rest.id, 'pedido:novo', p.obj); // pedido pago pelo site só vai para a cozinha depois de aprovado
  res.status(201).json({ pedido: pedidoParaCliente(p.obj), codigo: p.row.codigo_acomp, pagamento: pagamento ? { url: pagamento.url } : undefined });
}));

r.get('/acompanhar/:id', rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const p = await sistema(async c => {
    const row = (await c.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
    if (!row || !iguais(row.codigo_acomp, texto(req.query.c, 40))) return null;
    return (await repo.completarPedidos(c, [row]))[0];
  });
  if (!p) throw new ErroApp(404, 'Pedido não encontrado.');
  res.json({ pedido: pedidoParaCliente(p) });
}));

// Vários pedidos de uma vez: a lista que o ChefOnline guarda no aparelho do cliente (sem conta)
const limiteAcomp = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas consultas seguidas. Aguarde um pouco.' } });
r.post('/acompanhar', limiteAcomp, rota(async (req, res) => {
  const lista = (Array.isArray(req.body && req.body.pedidos) ? req.body.pedidos : []).slice(0, 20)
    .filter(x => x && uuidValido(String(x.id)) && x.c).map(x => ({ id: String(x.id), c: texto(x.c, 40) }));
  if (!lista.length) return res.json({ pedidos: [] });
  const out = await sistema(async c => {
    const rows = (await c.query('SELECT * FROM pedidos WHERE id = ANY($1) ORDER BY criado_em DESC', [lista.map(x => x.id)])).rows
      .filter(row => lista.some(x => x.id === row.id && iguais(row.codigo_acomp, x.c)));
    const completos = await repo.completarPedidos(c, rows);
    const rests = new Map((await c.query('SELECT id, slug, nome, cor FROM restaurantes WHERE id = ANY($1)', [[...new Set(rows.map(y => y.restaurante_id))]])).rows.map(y => [y.id, y]));
    const avs = new Map((await c.query('SELECT pedido_id, nota FROM avaliacoes WHERE pedido_id = ANY($1)', [rows.map(y => y.id)])).rows.map(y => [y.pedido_id, y]));
    return completos.map((p, i) => { const rr = rests.get(rows[i].restaurante_id) || {}; const av = avs.get(p.id);
      return Object.assign(pedidoParaCliente(p), { restaurante: { slug: rr.slug, nome: rr.nome, cor: rr.cor }, avaliacao: av ? { nota: av.nota } : null }); });
  });
  res.json({ pedidos: out });
}));

// Avaliação sem conta: quem tem o código do pedido (o aparelho que pediu) avalia uma vez, depois da entrega
const limiteAval = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas avaliações seguidas. Aguarde alguns minutos.' } });
r.post('/acompanhar/:id/avaliacao', limiteAval, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const b = req.body || {};
  const nota = Math.trunc(numero(b.nota, 0));
  if (nota < 1 || nota > 5) throw new ErroApp(400, 'Escolha de 1 a 5 estrelas.');
  await sistema(async c => {
    const p = (await c.query('SELECT id, restaurante_id, status, codigo_acomp, cliente_id FROM pedidos WHERE id = $1', [req.params.id])).rows[0];
    if (!p || !iguais(p.codigo_acomp, texto(b.c, 40))) throw new ErroApp(404, 'Pedido não encontrado.');
    if (p.status !== 'entregue') throw new ErroApp(409, 'Você pode avaliar depois que o pedido for entregue.');
    if ((await c.query('SELECT 1 FROM avaliacoes WHERE pedido_id = $1', [p.id])).rowCount) throw new ErroApp(409, 'Este pedido já foi avaliado.');
    await c.query('INSERT INTO avaliacoes (restaurante_id, cliente_id, pedido_id, nota, comentario) VALUES ($1,$2,$3,$4,$5)', [p.restaurante_id, p.cliente_id, p.id, nota, texto(b.comentario, 400)]);
  });
  res.status(201).json({ ok: true });
}));

r.post('/r/:slug/chamados', limiteChamados, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  const rc = recursosDe(rest);
  if (!rc.mesa || !rc.chamados) throw new ErroApp(409, 'Este restaurante não usa o chamado pelo celular. Chame o garçom no salão.');
  const n = Math.trunc(numero(req.body && req.body.mesa));
  const ch = await doRestaurante(rest.id, async c => {
    const m = (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = $2', [rest.id, n])).rows[0];
    if (!m || !iguais(m.token, texto(req.body.token, 40))) throw new ErroApp(403, 'QR Code da mesa inválido.');
    return (await c.query('INSERT INTO chamados (restaurante_id, mesa, tipo) VALUES ($1, $2, $3) RETURNING *', [rest.id, n, req.body.tipo === 'conta' ? 'conta' : 'garcom'])).rows[0];
  });
  rt.paraEquipe(rest.id, 'chamado:novo', { _id: ch.id, mesa: ch.mesa, tipo: ch.tipo, createdAt: ch.criado_em });
  res.status(201).json({ ok: true });
}));

module.exports = r;
