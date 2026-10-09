// Rotas abertas: o que o cliente usa pelo link do delivery ou pelo QR da mesa.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { doRestaurante, sistema } = require('../db');
const repo = require('../lib/repo');
const { montarPedido, metodosPermitidos, tiposPermitidos, PAGO_NO_SITE } = require('../lib/pedidos');
const pagamentos = require('../lib/pagamentos');
const config = require('../config');
const { recursosDe } = require('../lib/recursos');
const pix = require('../lib/pix');
const combos = require('../lib/combos');
const horarios = require('../lib/horarios');
const carrinho = require('../lib/carrinho');
const { ErroApp, rota, texto, numero, tokenAleatorio, iguais, estaAberto, uuidValido, pedidoParaCliente, horariosAgendamento, coordValida } = require('../lib/util');
const estoque = require('../lib/estoque');
const rt = require('../realtime');
const whatsapp = require('../lib/whatsapp');
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
  const { produtos, resumo, aval } = await doRestaurante(rest.id, async c => ({
    produtos: await repo.listarProdutos(c, rest.id),
    resumo: await estoque.resumoProdutos(c, rest.id),
    aval: {
      resumo: (await c.query('SELECT round(avg(nota)::numeric, 1) AS media, count(*)::int AS qtd FROM avaliacoes WHERE restaurante_id = $1', [rest.id])).rows[0],
      recentes: (await c.query(`SELECT a.nota, a.comentario, a.criado_em, p.cliente_nome FROM avaliacoes a JOIN pedidos p ON p.id = a.pedido_id
        WHERE a.restaurante_id = $1 AND length(a.comentario) >= 10 ORDER BY a.criado_em DESC LIMIT 10`, [rest.id])).rows
    }
  }));
  const cats = rest.categorias.length ? rest.categorias : [...new Set(produtos.map(p => p.categoria))];
  const foraDoHorario = p => horarios.ligado(rest) && !!p.disponibilidade && !horarios.disponivel(p.disponibilidade, new Date(), rest.fuso);
  const nomeCurto = n => { const p = String(n || 'Cliente').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
  res.json({
    restaurante: {
      nome: rest.nome, slug: rest.slug, frase: rest.frase, cor: rest.cor, logoUrl: rest.logoUrl, abre: rest.abre, fecha: rest.fecha,
      aberto: estaAberto(rest), aceitarForaDoHorario: rest.aceitarForaDoHorario, taxaServico: rest.taxaServico, chavePix: rest.chavePix, whatsapp: rest.whatsapp,
      delivery: Object.assign({}, rest.delivery, { local: coordValida(rest.delivery.local.lat, rest.delivery.local.lng) ? { lat: rest.delivery.local.lat, lng: rest.delivery.local.lng } : null }),
      agendamento: { ativo: !!rest.agendamento.ativo, dias: horariosAgendamento(rest) }, buscaEndereco: config.buscaEndereco, categorias: cats, recursos: recursosDe(rest), tipos: tiposPermitidos(rest), capaUrl: rest.capaUrl, sobre: rest.sobre,
      avaliacoes: { media: aval.resumo.media, qtd: aval.resumo.qtd, recentes: aval.recentes.map(a => ({ nome: nomeCurto(a.cliente_nome), nota: a.nota, comentario: a.comentario, em: a.criado_em })) },
      pagamentos: { mesa: metodosPermitidos(rest, 'mesa'), retirada: metodosPermitidos(rest, 'retirada'), delivery: metodosPermitidos(rest, 'delivery') },
      pixAuto: pix.ativo(rest)
    },
    // prato sem insumo suficiente no estoque aparece como esgotado (volta sozinho quando o estoque é reposto)
    produtos: combos.expandir(combos.filtrar(rest, produtos), new Set([...resumo].filter(([, v]) => v.semEstoque.length).map(([k]) => k).concat(produtos.filter(foraDoHorario).map(p => p.id)))).map(p => ({ id: p.id, categoria: p.categoria, nome: p.nome, descricao: p.descricao, preco: p.preco, selos: p.selos, opcoes: p.opcoes, fotoUrl: p.fotoUrl,
      esgotado: p.esgotado || !!(resumo.get(p.id) && resumo.get(p.id).semEstoque.length) || foraDoHorario(p), destaque: p.destaque, sugerir: p.sugerir,
      foraHorario: foraDoHorario(p) ? horarios.texto(p.disponibilidade) : undefined, horario: horarios.ligado(rest) && p.disponibilidade ? horarios.texto(p.disponibilidade) : undefined }))
  });
}));

// Restaurante mostrado na página inicial do site (SITE_RESTAURANTE; se não existir, o primeiro ativo)
r.get('/site', rota(async (req, res) => {
  const proprio = await require('../lib/dominios').slugDoHost(req.hostname); // domínio próprio: o restaurante dele
  if (proprio) return res.json({ slug: proprio, dominio: true });
  const slug = await sistema(async c => {
    const pref = (await c.query('SELECT slug FROM restaurantes WHERE slug = $1 AND ativo', [config.siteRestaurante])).rows[0];
    return pref ? pref.slug : ((await c.query('SELECT slug FROM restaurantes WHERE ativo ORDER BY criado_em LIMIT 1')).rows[0] || {}).slug || null;
  });
  res.json({ slug });
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
  let alertas = [];
  const p = await doRestaurante(rest.id, async c => {
    const dados = await montarPedido(c, rest, corpo);
    dados.codigoAcomp = tokenAleatorio(12);
    if (cliente) { dados.clienteId = cliente.id; dados.cliente.cpf = cliente.cpf; }
    const criado = await repo.criarPedido(c, rest.id, dados);
    alertas = await estoque.baixar(c, rest.id, criado.row.id, dados.linhasEstoque || dados.linhas, 'pedido #' + criado.row.numero);
    if (dados.cliente.tel) await carrinho.finalizar(c, rest.id, dados.cliente.tel);
    return criado;
  });
  if (alertas.length) rt.paraEquipe(rest.id, 'estoque:alerta', alertas);
  let pagamento, obj = p.obj;
  if (p.row.status === 'aguardando' && p.row.pag_metodo === 'pix') {
    // Pix automático: gera o QR; o pedido vai para a cozinha quando o Pix for confirmado
    obj = (await require('./pix').iniciarCobranca(req, rest, p.obj)).pedido;
  } else if (p.row.status === 'aguardando') {
    pagamento = await pagamentos.provedor().iniciar(p.obj, p.row.codigo_acomp);
    await sistema(c => c.query('UPDATE pedidos SET pag_ref = $2 WHERE id = $1', [p.row.id, pagamento.ref]));
  } else { rt.paraEquipe(rest.id, 'pedido:novo', p.obj); whatsapp.avisar(rest, p.obj); } // pedido pago pelo site só vai para a cozinha depois de aprovado
  res.status(201).json({ pedido: pedidoParaCliente(obj), codigo: p.row.codigo_acomp, pagamento: pagamento ? { url: pagamento.url } : undefined });
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

// Vários pedidos de uma vez: a lista que o site do restaurante guarda no aparelho do cliente (sem conta)
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

// Recuperação de carrinho: o site guarda o carrinho de quem marcou "me lembrar" e deu o WhatsApp
const limiteCarr = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas.' } });
r.put('/r/:slug/carrinho', limiteCarr, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  if (!carrinho.ligado(rest)) throw new ErroApp(404, 'Função indisponível.');
  const b = req.body || {}, tel = carrinho.digitos(b.tel);
  if (tel.length < 10 || tel.length > 13) throw new ErroApp(400, 'Informe o WhatsApp com DDD.');
  const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 40).filter(i => i && uuidValido(String(i.produto))).map(i => ({ produto: String(i.produto), qtd: Math.max(1, Math.min(50, Math.trunc(numero(i.qtd, 1)))), escolhas: i.escolhas && typeof i.escolhas === 'object' ? i.escolhas : {} }));
  if (!itens.length) throw new ErroApp(400, 'Carrinho vazio.');
  const cod = await doRestaurante(rest.id, async c => {
    const precos = new Map((await c.query('SELECT id, preco FROM produtos WHERE restaurante_id = $1 AND id = ANY($2::uuid[])', [rest.id, itens.map(i => i.produto)])).rows.map(x => [x.id, Number(x.preco)]));
    const valid = itens.filter(i => precos.has(i.produto)); if (!valid.length) throw new ErroApp(400, 'Carrinho vazio.');
    const total = valid.reduce((a, i) => a + precos.get(i.produto) * i.qtd, 0);
    // só letras no nome (ele vai na mensagem do WhatsApp: nada de links)
    const nome = (String(b.nome || '').normalize('NFC').match(/[\p{L}]+/u) || [''])[0].slice(0, 20);
    const vals = [rest.id, nome, tel, JSON.stringify(valid), Math.round(total * 100) / 100];
    const aberto = (await c.query('SELECT id, codigo FROM carrinhos WHERE restaurante_id = $1 AND tel = $2 AND lembrado_em IS NULL AND finalizado_em IS NULL FOR UPDATE', [rest.id, tel])).rows[0];
    if (aberto) {
      // só quem criou (tem o código) atualiza: ninguém troca o carrinho de outra pessoa digitando o WhatsApp dela
      if (!iguais(aberto.codigo, String(b.codigo || ''))) return null;
      await c.query('UPDATE carrinhos SET nome = $2, itens = $4, total = $5, atualizado_em = now() WHERE id = $6 AND restaurante_id = $1 AND tel = $3', vals.concat([aberto.id]));
      return aberto.codigo;
    }
    const codigo = tokenAleatorio(18); // sempre um código novo (nunca o que veio do navegador)
    await c.query('INSERT INTO carrinhos (restaurante_id, nome, tel, itens, total, codigo) VALUES ($1,$2,$3,$4,$5,$6)', vals.concat([codigo]));
    return codigo;
  });
  res.json({ codigo: cod || undefined });
}));
r.delete('/r/:slug/carrinho/:codigo', limiteCarr, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  await doRestaurante(rest.id, c => c.query('DELETE FROM carrinhos WHERE restaurante_id = $1 AND codigo = $2', [rest.id, texto(req.params.codigo, 40)]));
  res.json({ ok: true });
}));
// Link do lembrete: devolve os itens do carrinho
r.get('/r/:slug/carrinho/:codigo', limiteCarr, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  const k = await doRestaurante(rest.id, async c => (await c.query("SELECT itens, nome, finalizado_em FROM carrinhos WHERE restaurante_id = $1 AND codigo = $2 AND criado_em > now() - interval '7 days'", [rest.id, texto(req.params.codigo, 40)])).rows[0]);
  if (!k) throw new ErroApp(404, 'Este carrinho expirou.');
  res.json({ itens: k.itens, finalizado: !!k.finalizado_em });
}));

// Conta da mesa: pedidos ainda não pagos das últimas 12 horas (o garçom "fecha a conta" no painel e ela zera)
async function contaDaMesa(c, rid, mesa) {
  const rows = (await c.query(`SELECT * FROM pedidos WHERE restaurante_id = $1 AND tipo = 'mesa' AND mesa = $2 AND NOT pag_pago
    AND status NOT IN ('cancelado', 'aguardando') AND criado_em > now() - interval '12 hours' ORDER BY criado_em`, [rid, mesa])).rows;
  const pedidos = await repo.completarPedidos(c, rows);
  const soma = k => Math.round(pedidos.reduce((a, p) => a + p[k], 0) * 100) / 100;
  return { pedidos: pedidos.map(p => ({ numero: p.numero, status: p.status, linhas: p.linhas.map(l => ({ nome: l.nome, qtd: l.qtd, unit: l.unit, opcoes: l.opcoes })), total: p.total, criadoEm: p.createdAt })),
    subtotal: soma('subtotal'), servico: soma('servico'), total: soma('total') };
}
async function validarMesa(c, rest, n, token) {
  const m = (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = $2', [rest.id, n])).rows[0];
  if (!m || !iguais(m.token, texto(token, 40))) throw new ErroApp(403, 'QR Code da mesa inválido. Peça ajuda ao garçom.');
}
r.get('/r/:slug/mesa/:numero/conta', limiteAcomp, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  if (!recursosDe(rest).mesa) throw new ErroApp(409, 'Este restaurante não recebe pedidos pela mesa.');
  const n = Math.trunc(numero(req.params.numero));
  const conta = await doRestaurante(rest.id, async c => { await validarMesa(c, rest, n, req.query.t); return contaDaMesa(c, rest.id, n); });
  res.json({ mesa: n, taxaServico: rest.taxaServico, conta });
}));

r.post('/r/:slug/chamados', limiteChamados, rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  const rc = recursosDe(rest), b = req.body || {};
  if (!rc.mesa || !rc.chamados) throw new ErroApp(409, 'Este restaurante não usa o chamado pelo celular. Chame o garçom no salão.');
  const n = Math.trunc(numero(b.mesa)), tipo = b.tipo === 'conta' ? 'conta' : 'garcom';
  const pagamento = tipo === 'conta' && ['pix', 'cartao', 'dinheiro'].includes(b.pagamento) ? b.pagamento : '';
  const pessoas = tipo === 'conta' ? Math.min(30, Math.max(1, Math.trunc(numero(b.pessoas, 1)))) : 1;
  const out = await doRestaurante(rest.id, async c => {
    await validarMesa(c, rest, n, b.token);
    const conta = tipo === 'conta' ? await contaDaMesa(c, rest.id, n) : null;
    // chamado igual ainda não atendido: atualiza em vez de repetir (evita a equipe receber 5 chamados da mesma mesa)
    const aberto = (await c.query("SELECT * FROM chamados WHERE restaurante_id = $1 AND mesa = $2 AND tipo = $3 AND NOT atendido AND criado_em > now() - interval '2 hours' ORDER BY criado_em DESC LIMIT 1", [rest.id, n, tipo])).rows[0];
    if (aberto) {
      const ch = (await c.query('UPDATE chamados SET pagamento = $2, pessoas = $3, total = $4 WHERE id = $1 RETURNING *', [aberto.id, pagamento, pessoas, conta ? conta.total : 0])).rows[0];
      return { ch, repetido: true, conta };
    }
    const ch = (await c.query('INSERT INTO chamados (restaurante_id, mesa, tipo, pagamento, pessoas, total) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [rest.id, n, tipo, pagamento, pessoas, conta ? conta.total : 0])).rows[0];
    return { ch, repetido: false, conta };
  });
  const ch = out.ch, obj = { _id: ch.id, mesa: ch.mesa, tipo: ch.tipo, pagamento: ch.pagamento, pessoas: ch.pessoas, total: ch.total, createdAt: ch.criado_em };
  rt.paraEquipe(rest.id, out.repetido ? 'chamado:atualizado' : 'chamado:novo', obj);
  res.status(out.repetido ? 200 : 201).json({ ok: true, repetido: out.repetido, chamado: obj, conta: out.conta });
}));

// Totem: confere o código secreto do link do totem
r.get('/r/:slug/totem', rota(async (req, res) => {
  const rest = await carregar(req.params.slug);
  res.json({ valido: !!(recursosDe(rest).totem && rest.totemToken && iguais(rest.totemToken, texto(req.query.t, 40))) });
}));

// Busca de endereço (OpenStreetMap / Nominatim) para a taxa por distância. Com cache e limite, como pede a política de uso deles.
const limiteBusca = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas buscas seguidas. Aguarde um pouco ou marque no mapa.' } });
const cacheBusca = new Map();
let ultimaBusca = 0;
async function nominatim(caminho) {
  if (cacheBusca.has(caminho)) return cacheBusca.get(caminho);
  const espera = 1100 - (Date.now() - ultimaBusca); if (espera > 0) await new Promise(r => setTimeout(r, espera)); // no máximo 1 busca por segundo
  ultimaBusca = Date.now();
  let r;
  try { r = await fetch('https://nominatim.openstreetmap.org' + caminho, { headers: { 'User-Agent': 'CardapioDigital/1.0 (' + (config.buscaEnderecoContato || config.urlPublica || 'sem-contato') + ')', 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(8000) }); }
  catch (e) { throw new ErroApp(502, 'A busca de endereço está indisponível agora. Marque o local no mapa.'); }
  if (!r.ok) throw new ErroApp(502, 'A busca de endereço está indisponível agora. Marque o local no mapa.');
  const d = await r.json();
  if (cacheBusca.size > 500) cacheBusca.delete(cacheBusca.keys().next().value);
  cacheBusca.set(caminho, d);
  return d;
}
const resumoEndereco = x => { const a = x.address || {}; return { lat: Number(x.lat), lng: Number(x.lon), rua: [a.road || a.pedestrian || '', a.house_number || ''].filter(Boolean).join(', '), bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || '', cidade: a.city || a.town || a.village || '', texto: x.display_name }; };
r.get('/r/:slug/endereco', limiteBusca, rota(async (req, res) => {
  if (!config.buscaEndereco) throw new ErroApp(404, 'Busca de endereço desligada. Marque o local no mapa.');
  const rest = await carregar(req.params.slug), q = texto(req.query.q, 120);
  if (q.length < 4) throw new ErroApp(400, 'Digite a rua e o número.');
  const loc = rest.delivery.local || {};
  const perto = coordValida(loc.lat, loc.lng) ? '&viewbox=' + [loc.lng - 0.25, loc.lat + 0.25, loc.lng + 0.25, loc.lat - 0.25].map(v => v.toFixed(4)).join(',') + '&bounded=1' : '';
  const d = await nominatim('/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=br' + perto + '&q=' + encodeURIComponent(q));
  res.json({ resultados: (Array.isArray(d) ? d : []).map(resumoEndereco) });
}));
r.get('/r/:slug/endereco/reverso', limiteBusca, rota(async (req, res) => {
  if (!config.buscaEndereco) throw new ErroApp(404, 'Busca de endereço desligada.');
  await carregar(req.params.slug);
  const lat = numero(req.query.lat, NaN), lng = numero(req.query.lng, NaN);
  if (!coordValida(lat, lng)) throw new ErroApp(400, 'Local inválido.');
  const d = await nominatim('/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=' + lat.toFixed(5) + '&lon=' + lng.toFixed(5));
  res.json({ endereco: d && d.lat ? resumoEndereco(d) : null });
}));

module.exports = r;
