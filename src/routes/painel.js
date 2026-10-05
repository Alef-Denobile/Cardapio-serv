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

const r = express.Router();
const equipe = exigir();            // dono, cozinha ou entregador
const dono = exigir('dono');
const comRecurso = k => (req, res, next) => recursosDe(req.rest)[k] ? next() : next(new ErroApp(403, 'Este recurso não está incluído no plano do restaurante. Fale com o suporte.'));
const noRest = (req, fn) => doRestaurante(req.rid, fn);
const semCodigo = p => { const o = Object.assign({}, p); delete o.codigoAcomp; return o; };

/* ---------- Pedidos ---------- */
r.get('/pedidos', equipe, rota(async (req, res) => {
  const out = await noRest(req, async c => {
    const rest = await repo.carregarRest(c, req.rid);
    const soEntrega = req.usuario.papel === 'entregador';
    const rows = (await c.query("SELECT * FROM pedidos WHERE restaurante_id = $1 AND status IN ('novo','preparo','pronto','rota')" + (soEntrega ? " AND tipo = 'delivery'" : '') + ' ORDER BY criado_em LIMIT 300', [req.rid])).rows;
    const finalizadosHoje = (await c.query("SELECT count(*)::int AS n FROM pedidos WHERE restaurante_id = $1 AND status = 'entregue' AND criado_em >= $2", [req.rid, inicioDoDia(rest.fuso)])).rows[0].n;
    const chamados = soEntrega ? [] : (await c.query('SELECT * FROM chamados WHERE restaurante_id = $1 AND NOT atendido ORDER BY criado_em', [req.rid])).rows.map(x => ({ _id: x.id, mesa: x.mesa, tipo: x.tipo, createdAt: x.criado_em }));
    return { pedidos: await repo.completarPedidos(c, rows), chamados, finalizadosHoje };
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
    return (await repo.buscarPedido(c, req.rid, row.id)).obj;
  });
  rt.paraEquipe(req.rid, 'pedido:atualizado', p);
  rt.paraCliente(p.id, 'pedido:atualizado', pedidoParaCliente(p), p.clienteId);
  whatsapp.avisar(req.rest, p);
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
  const n = await noRest(req, async c => (await c.query('UPDATE chamados SET atendido = true WHERE id = $1 AND restaurante_id = $2', [req.params.id, req.rid])).rowCount);
  if (!n) throw new ErroApp(404, 'Chamado não encontrado.');
  rt.paraEquipe(req.rid, 'chamado:atendido', { _id: req.params.id });
  res.json({ ok: true });
}));

/* ---------- Produtos ---------- */
r.get('/produtos', equipe, rota(async (req, res) => {
  res.json({ produtos: await noRest(req, c => repo.listarProdutos(c, req.rid)) });
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
const paraDono = rest => { const o = Object.assign({}, rest); delete o.observacoes; return o; };
r.get('/restaurante', dono, rota(async (req, res) => {
  res.json({ restaurante: paraDono(await noRest(req, c => repo.carregarRest(c, req.rid))) });
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
