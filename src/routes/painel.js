// Rotas da área do restaurante. Todas exigem login e rodam dentro de
// doRestaurante(): o próprio banco só deixa ver e alterar dados desse restaurante.
const express = require('express');
const bcrypt = require('bcryptjs');
const { doRestaurante } = require('../db');
const repo = require('../lib/repo');
const { exigir } = require('../middleware/auth');
const { ErroApp, rota, texto, numero, centavos, tokenAleatorio, inicioDoDia, uuidValido, pedidoParaCliente } = require('../lib/util');
const { limparProduto, limparConfig } = require('../lib/dados');
const { recursosDe } = require('../lib/recursos');
const rt = require('../realtime');
const whatsapp = require('../lib/whatsapp');
const estoque = require('../lib/estoque');
const notas = require('../lib/notas');
const fiscal = require('../lib/fiscal');
const config = require('../config');

const r = express.Router();
const equipe = exigir();            // dono, cozinha ou entregador
const dono = exigir('dono');
const comRecurso = k => (req, res, next) => recursosDe(req.rest)[k] ? next() : next(new ErroApp(403, 'Este recurso não está incluído no plano do restaurante. Fale com o suporte.'));
const noRest = (req, fn) => doRestaurante(req.rid, fn);
const semCodigo = p => { const o = Object.assign({}, p); delete o.codigoAcomp; return o; };

const chamadoObj = x => ({ _id: x.id, mesa: x.mesa, tipo: x.tipo, pagamento: x.pagamento, pessoas: x.pessoas, total: x.total, createdAt: x.criado_em });

/* ---------- Pedidos ---------- */
r.get('/pedidos', equipe, rota(async (req, res) => {
  const out = await noRest(req, async c => {
    const rest = await repo.carregarRest(c, req.rid);
    const soEntrega = req.usuario.papel === 'entregador';
    const rows = (await c.query("SELECT * FROM pedidos WHERE restaurante_id = $1 AND status IN ('novo','preparo','pronto','rota')" + (soEntrega ? " AND tipo = 'delivery'" : '') + ' ORDER BY criado_em LIMIT 300', [req.rid])).rows;
    const finalizadosHoje = (await c.query("SELECT count(*)::int AS n FROM pedidos WHERE restaurante_id = $1 AND status = 'entregue' AND criado_em >= $2", [req.rid, inicioDoDia(rest.fuso)])).rows[0].n;
    const chamados = soEntrega ? [] : (await c.query('SELECT * FROM chamados WHERE restaurante_id = $1 AND NOT atendido ORDER BY criado_em', [req.rid])).rows.map(chamadoObj);
    const pedidos = await repo.completarPedidos(c, rows);
    if (!soEntrega && recursosDe(req.rest).nfce) { const ns = await notas.notasDosPedidos(c, req.rid, pedidos.map(x => x.id)); pedidos.forEach(x => { x.nota = ns.get(x.id) || null; }); }
    return { pedidos, chamados, finalizadosHoje };
  });
  res.json(out);
}));

r.get('/pedidos/historico', dono, rota(async (req, res) => {
  const desde = new Date(numero(req.query.desde, Date.now() - 30 * 86400000));
  const limite = Math.min(500, Math.max(1, Math.trunc(numero(req.query.limite, 100))));
  const lista = await noRest(req, async c => repo.completarPedidos(c, (await c.query("SELECT * FROM pedidos WHERE restaurante_id = $1 AND criado_em >= $2 AND status <> 'aguardando' ORDER BY criado_em DESC LIMIT $3", [req.rid, desde, limite])).rows));
  res.json({ pedidos: lista });
}));

const FLUXO = { aguardando: [], novo: ['preparo', 'cancelado'], preparo: ['pronto', 'cancelado'], pronto: ['rota', 'entregue', 'cancelado'], rota: ['entregue'], entregue: [], cancelado: [] };

r.patch('/pedidos/:id/status', equipe, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const p = await noRest(req, async c => {
    const row = (await c.query('SELECT * FROM pedidos WHERE id = $1 AND restaurante_id = $2 FOR UPDATE', [req.params.id, req.rid])).rows[0];
    if (!row) throw new ErroApp(404, 'Pedido não encontrado.');
    const novo = texto(req.body && req.body.status, 12), u = req.usuario, papel = u.papel;
    if (!FLUXO[row.status].includes(novo)) throw new ErroApp(409, 'Esse pedido não pode ir para essa etapa agora. Atualize a tela.');
    if (novo === 'cancelado' && papel !== 'dono') throw new ErroApp(403, 'Só o dono pode cancelar pedidos.');
    if (novo === 'rota' && row.tipo !== 'delivery') throw new ErroApp(409, 'Só pedidos de entrega saem para entrega.');
    if (row.status === 'pronto' && novo === 'entregue' && row.tipo === 'delivery') throw new ErroApp(409, 'Pedido de entrega precisa sair com um entregador antes.');
    if (papel === 'entregador') {
      if (row.tipo !== 'delivery' || !['rota', 'entregue'].includes(novo)) throw new ErroApp(403, 'Entregadores só pegam e finalizam entregas.');
      if (novo === 'entregue' && String(row.entregador_id) !== String(u.id)) throw new ErroApp(403, 'Esta entrega está com outro entregador.');
    }
    let ent = null;
    if (novo === 'rota') {
      if (papel === 'entregador') ent = { id: u.id, nome: u.nome };
      else {
        const eid = req.body && req.body.entregador;
        ent = uuidValido(eid) ? (await c.query("SELECT id, nome FROM usuarios WHERE id = $1 AND restaurante_id = $2 AND papel = 'entregador' AND ativo", [eid, req.rid])).rows[0] : null;
        if (!ent) throw new ErroApp(400, 'Escolha o entregador.');
      }
    }
    await c.query('UPDATE pedidos SET status = $3, entregador_id = COALESCE($4, entregador_id), entregador_nome = COALESCE($5, entregador_nome), pag_pago = pag_pago OR ($3 = \'entregue\' AND pag_metodo <> \'pix\') WHERE id = $1 AND restaurante_id = $2',
      [row.id, req.rid, novo, ent && ent.id, ent && ent.nome]);
    await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1, $2, $3, $4)', [row.id, req.rid, novo, u.nome]);
    if (novo === 'cancelado') await estoque.devolver(c, req.rid, row.id, 'cancelado por ' + u.nome); // o que foi baixado volta ao estoque
    return (await repo.buscarPedido(c, req.rid, row.id)).obj;
  });
  rt.paraEquipe(req.rid, 'pedido:atualizado', p);
  rt.paraCliente(p.id, 'pedido:atualizado', pedidoParaCliente(p), p.clienteId);
  whatsapp.avisar(req.rest, p);
  if (p.status === 'entregue') notas.automatica(req.rid, p); // NFC-e automática, se o dono ligou
  res.json({ pedido: semCodigo(p) });
}));

r.patch('/pedidos/:id/pagamento', equipe, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const p = await noRest(req, async c => {
    const row = (await c.query('SELECT entregador_id FROM pedidos WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rows[0];
    if (!row) throw new ErroApp(404, 'Pedido não encontrado.');
    if (req.usuario.papel === 'entregador' && String(row.entregador_id) !== String(req.usuario.id)) throw new ErroApp(403, 'Esta entrega está com outro entregador.');
    await c.query('UPDATE pedidos SET pag_pago = $3 WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid, !!(req.body && req.body.pago)]);
    return (await repo.buscarPedido(c, req.rid, req.params.id)).obj;
  });
  rt.paraEquipe(req.rid, 'pedido:atualizado', p);
  rt.paraCliente(p.id, 'pedido:atualizado', pedidoParaCliente(p), p.clienteId);
  res.json({ pedido: p });
}));

/* ---------- Chamados de mesa ---------- */
r.patch('/chamados/:id', equipe, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Chamado não encontrado.');
  const n = await noRest(req, async c => (await c.query('UPDATE chamados SET atendido = true, atendido_em = now() WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rowCount);
  if (!n) throw new ErroApp(404, 'Chamado não encontrado.');
  rt.paraEquipe(req.rid, 'chamado:atendido', { _id: req.params.id });
  res.json({ ok: true });
}));
// Fechar a conta da mesa: marca como pagos os pedidos em aberto da mesa e encerra os chamados dela
r.post('/mesas/:numero/fechar-conta', equipe, rota(async (req, res) => {
  if (req.usuario.papel === 'entregador') throw new ErroApp(403, 'Você não tem permissão para fazer isso.');
  const n = Math.trunc(numero(req.params.numero));
  const out = await noRest(req, async c => {
    const rows = (await c.query(`UPDATE pedidos SET pag_pago = true WHERE restaurante_id = $1 AND tipo = 'mesa' AND mesa = $2 AND NOT pag_pago
      AND status NOT IN ('cancelado', 'aguardando') AND criado_em > now() - interval '12 hours' RETURNING *`, [req.rid, n])).rows;
    for (const x of rows) await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1,$2,$3,$4)', [x.id, req.rid, x.status, 'conta fechada por ' + req.usuario.nome]);
    const chs = (await c.query('UPDATE chamados SET atendido = true, atendido_em = now() WHERE restaurante_id = $1 AND mesa = $2 AND NOT atendido RETURNING id', [req.rid, n])).rows;
    return { pedidos: await repo.completarPedidos(c, rows), chamados: chs.map(x => x.id) };
  });
  out.pedidos.forEach(p => { rt.paraEquipe(req.rid, 'pedido:atualizado', p); rt.paraCliente(p.id, 'pedido:atualizado', pedidoParaCliente(p), p.clienteId); });
  out.chamados.forEach(id => rt.paraEquipe(req.rid, 'chamado:atendido', { _id: id }));
  res.json({ pedidos: out.pedidos.length, total: Math.round(out.pedidos.reduce((a, p) => a + p.total, 0) * 100) / 100 });
}));

/* ---------- NFC-e ---------- */
const notaEquipe = (req, res, next) => req.usuario.papel === 'entregador' ? next(new ErroApp(403, 'Você não tem permissão para fazer isso.')) : next();
r.post('/pedidos/:id/nfce', equipe, notaEquipe, comRecurso('nfce'), rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const b = req.body || {};
  res.status(201).json({ nota: await notas.emitir(req.rid, req.params.id, { pagamento: texto(b.pagamento, 2), cpf: texto(b.cpf, 20) }) });
}));
r.get('/notas/:id', equipe, notaEquipe, comRecurso('nfce'), rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Nota não encontrada.');
  res.json({ nota: await notas.atualizar(req.rid, req.params.id) });
}));
r.post('/notas/:id/cancelar', dono, comRecurso('nfce'), rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Nota não encontrada.');
  res.json({ nota: await notas.cancelar(req.rid, req.params.id, req.body && req.body.justificativa) });
}));

/* ---------- Fotos enviadas do celular ou do computador ---------- */
function tipoDaImagem(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
r.post('/fotos', dono, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }), rota(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw new ErroApp(400, 'Envie uma foto JPG, PNG ou WEBP.');
  const tipo = tipoDaImagem(buf);
  if (!tipo) throw new ErroApp(400, 'Esse arquivo não parece uma foto. Use JPG, PNG ou WEBP.');
  const id = await noRest(req, async c => {
    // apaga fotos enviadas há mais de um dia que não estão em uso (troca de foto, envio cancelado)
    await c.query(`DELETE FROM fotos f WHERE f.restaurante_id = $1 AND f.criado_em < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.restaurante_id = $1 AND p.foto_url = '/f/' || f.id)
      AND NOT EXISTS (SELECT 1 FROM restaurantes r WHERE r.id = $1 AND ('/f/' || f.id) IN (r.logo_url, r.capa_url))`, [req.rid]);
    const n = (await c.query('SELECT count(*)::int AS n FROM fotos WHERE restaurante_id = $1', [req.rid])).rows[0].n;
    if (n >= 400) throw new ErroApp(409, 'Limite de 400 fotos atingido. Remova produtos antigos ou fale com o suporte.');
    return (await c.query('INSERT INTO fotos (restaurante_id, tipo, dados, tamanho) VALUES ($1,$2,$3,$4) RETURNING id', [req.rid, tipo, buf, buf.length])).rows[0].id;
  });
  res.status(201).json({ url: '/f/' + id });
}));

/* ---------- Modo totem ---------- */
r.get('/totem', dono, comRecurso('totem'), rota(async (req, res) => {
  const t = await noRest(req, async c => {
    const atual = (await c.query('SELECT totem_token FROM restaurantes WHERE id = $1', [req.rid])).rows[0].totem_token;
    if (atual) return atual;
    return (await c.query('UPDATE restaurantes SET totem_token = $2 WHERE id = $1 RETURNING totem_token', [req.rid, tokenAleatorio(12)])).rows[0].totem_token;
  });
  res.json({ token: t });
}));
r.post('/totem/novo-codigo', dono, comRecurso('totem'), rota(async (req, res) => {
  const t = await noRest(req, async c => (await c.query('UPDATE restaurantes SET totem_token = $2 WHERE id = $1 RETURNING totem_token', [req.rid, tokenAleatorio(12)])).rows[0].totem_token);
  res.json({ token: t });
}));

/* ---------- Produtos ---------- */
r.get('/produtos', equipe, rota(async (req, res) => {
  const out = await noRest(req, async c => {
    const l = await repo.listarProdutos(c, req.rid), resumo = await estoque.resumoProdutos(c, req.rid);
    const dono = req.usuario.papel === 'dono';
    return l.map(p => { const r0 = resumo.get(p.id); return Object.assign(p, { semEstoque: r0 ? r0.semEstoque : [], ficha: r0 && dono ? r0.ficha : [], custo: r0 && dono ? r0.custo : null }); });
  });
  res.json({ produtos: out });
}));
r.post('/produtos', dono, rota(async (req, res) => {
  const dados = limparProduto(req.body || {});
  const p = await noRest(req, async c => { const p = await repo.criarProduto(c, req.rid, dados); await repo.adicionarCategoria(c, req.rid, dados.categoria); return p; });
  res.status(201).json({ produto: p });
}));
r.put('/produtos/:id', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Produto não encontrado.');
  const dados = limparProduto(req.body || {});
  const p = await noRest(req, async c => { const p = await repo.atualizarProduto(c, req.rid, req.params.id, dados); if (p) await repo.adicionarCategoria(c, req.rid, dados.categoria); return p; });
  if (!p) throw new ErroApp(404, 'Produto não encontrado.');
  res.json({ produto: p });
}));
// Ajustes rápidos: cozinha pode marcar esgotado; dono também muda preço e destaque
r.patch('/produtos/:id', equipe, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Produto não encontrado.');
  const b = req.body || {}, mud = {};
  if ('esgotado' in b){ if (req.usuario.papel === 'entregador') throw new ErroApp(403, 'Você não tem permissão para fazer isso.'); mud.esgotado = !!b.esgotado; }
  if ('preco' in b || 'destaque' in b){
    if (req.usuario.papel !== 'dono') throw new ErroApp(403, 'Só o dono altera preços e destaques.');
    if ('preco' in b){ const v = centavos(numero(b.preco, -1)); if (!(v >= 0)) throw new ErroApp(400, 'Preço inválido.'); mud.preco = v; }
    if ('destaque' in b) mud.destaque = !!b.destaque;
  }
  const p = await noRest(req, c => repo.ajustarProduto(c, req.rid, req.params.id, mud));
  if (!p) throw new ErroApp(404, 'Produto não encontrado.');
  res.json({ produto: p });
}));
r.delete('/produtos/:id', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Produto não encontrado.');
  const n = await noRest(req, async c => (await c.query('DELETE FROM produtos WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rowCount);
  if (!n) throw new ErroApp(404, 'Produto não encontrado.');
  res.json({ ok: true });
}));

/* ---------- Configurações do restaurante ---------- */
const paraDono = rest => { const o = Object.assign({}, rest); delete o.observacoes; delete o.totemToken; return o; };
r.get('/restaurante', dono, rota(async (req, res) => {
  res.json({ restaurante: paraDono(await noRest(req, c => repo.carregarRest(c, req.rid))), fiscalProvedor: config.fiscalProvedor, buscaEndereco: config.buscaEndereco });
}));
r.put('/restaurante', dono, rota(async (req, res) => {
  const mud = limparConfig(req.body);
  const rest = await noRest(req, async c => { await repo.salvarConfig(c, req.rid, mud); return repo.carregarRest(c, req.rid); });
  res.json({ restaurante: paraDono(rest) });
}));

/* ---------- Mesas e QR Codes ---------- */
const listarMesas = async (c, rid) => (await c.query('SELECT numero, token FROM mesas WHERE restaurante_id = $1 ORDER BY numero', [rid])).rows;
r.get('/mesas', dono, comRecurso('mesa'), rota(async (req, res) => {
  res.json({ mesas: await noRest(req, c => listarMesas(c, req.rid)) });
}));
r.post('/mesas', dono, comRecurso('mesa'), rota(async (req, res) => {
  const q = Math.trunc(numero(req.body && req.body.quantidade, 0));
  if (q < 1 || q > 200) throw new ErroApp(400, 'Informe entre 1 e 200 mesas.');
  const mesas = await noRest(req, async c => {
    const existentes = new Set((await c.query('SELECT numero FROM mesas WHERE restaurante_id = $1', [req.rid])).rows.map(m => m.numero));
    for (let n = 1; n <= q; n++) if (!existentes.has(n)) await c.query('INSERT INTO mesas (restaurante_id, numero, token) VALUES ($1, $2, $3)', [req.rid, n, tokenAleatorio()]);
    await c.query('DELETE FROM mesas WHERE restaurante_id = $1 AND numero > $2', [req.rid, q]);
    return listarMesas(c, req.rid);
  });
  res.json({ mesas });
}));
r.post('/mesas/:numero/novo-codigo', dono, comRecurso('mesa'), rota(async (req, res) => {
  const m = await noRest(req, async c => (await c.query('UPDATE mesas SET token = $3 WHERE restaurante_id = $1 AND numero = $2 RETURNING numero, token', [req.rid, Math.trunc(numero(req.params.numero)), tokenAleatorio()])).rows[0]);
  if (!m) throw new ErroApp(404, 'Mesa não encontrada.');
  res.json({ mesa: m });
}));

/* ---------- Equipe ---------- */
r.get('/entregadores', equipe, rota(async (req, res) => {
  const l = await noRest(req, async c => (await c.query("SELECT id, nome FROM usuarios WHERE restaurante_id = $1 AND papel = 'entregador' AND ativo ORDER BY nome", [req.rid])).rows);
  res.json({ entregadores: l });
}));
r.get('/equipe', dono, rota(async (req, res) => {
  const l = await noRest(req, async c => (await c.query('SELECT * FROM usuarios WHERE restaurante_id = $1 ORDER BY papel, nome', [req.rid])).rows);
  res.json({ equipe: l.map(repo.usuarioPublico) });
}));
r.post('/equipe', dono, rota(async (req, res) => {
  const b = req.body || {};
  const nome = texto(b.nome, 60), email = texto(b.email, 120).toLowerCase(), senha = String(b.senha || ''), papel = ['dono', 'cozinha', 'entregador'].includes(b.papel) ? b.papel : null;
  if (!nome || !/^\S+@\S+\.\S+$/.test(email)) throw new ErroApp(400, 'Informe nome e um e-mail válido.');
  if (senha.length < 8) throw new ErroApp(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (!papel) throw new ErroApp(400, 'Escolha a função da pessoa.');
  const hash = await bcrypt.hash(senha, 10);
  try {
    const u = await noRest(req, async c => (await c.query('INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.rid, nome, email, papel, hash])).rows[0]);
    res.status(201).json({ usuario: repo.usuarioPublico(u) });
  } catch (e) { if (e.code === '23505') throw new ErroApp(409, 'Já existe uma conta com esse e-mail.'); throw e; }
}));
r.delete('/equipe/:id', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pessoa não encontrada.');
  if (String(req.params.id) === String(req.usuario.id)) throw new ErroApp(400, 'Você não pode remover a própria conta.');
  const n = await noRest(req, async c => (await c.query('DELETE FROM usuarios WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rowCount);
  if (!n) throw new ErroApp(404, 'Pessoa não encontrada.');
  res.json({ ok: true });
}));

// "Esqueci minha senha" da equipe: o dono define uma senha nova e passa para a pessoa
r.post('/equipe/:id/senha', dono, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pessoa não encontrada.');
  const senha = String((req.body && req.body.senha) || '');
  if (senha.length < 8) throw new ErroApp(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  const hash = await bcrypt.hash(senha, 10);
  const n = await noRest(req, async c => (await c.query('UPDATE usuarios SET senha_hash = $3 WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid, hash])).rowCount);
  if (!n) throw new ErroApp(404, 'Pessoa não encontrada.');
  res.json({ ok: true });
}));

module.exports = r;
