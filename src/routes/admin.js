// Área de devs: gerencia todos os restaurantes da plataforma.
// Roda em contexto de sistema (enxerga todos) e registra toda alteração na auditoria.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { sistema } = require('../db');
const repo = require('../lib/repo');
const { assinarAdmin, exigirAdmin } = require('../middleware/admin');
const { criarRestaurante } = require('../lib/criarRestaurante');
const { limparProduto, limparConfig } = require('../lib/dados');
const { RECURSOS, recursosDe } = require('../lib/recursos');
const { ErroApp, rota, texto, numero, centavos, uuidValido } = require('../lib/util');

const r = express.Router();
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas de entrar. Aguarde 15 minutos.' } });
const reais = v => 'R$ ' + (+v || 0).toFixed(2).replace('.', ',');
const auditoriaObj = a => ({ _id: a.id, acao: a.acao, detalhe: a.detalhe, adminNome: a.admin_nome, restauranteNome: a.restaurante_nome, createdAt: a.criado_em });

async function registrar(c, req, rest, acao, detalhe) {
  await c.query('INSERT INTO auditoria (restaurante_id, restaurante_nome, admin_id, admin_nome, acao, detalhe) VALUES ($1,$2,$3,$4,$5,$6)',
    [rest ? rest.id : null, rest ? rest.nome : null, req.admin.id, req.admin.nome, acao, detalhe || '']);
}
async function restDe(c, id) {
  if (!uuidValido(id)) throw new ErroApp(404, 'Restaurante não encontrado.');
  const rest = await repo.carregarRest(c, id);
  if (!rest) throw new ErroApp(404, 'Restaurante não encontrado.');
  return rest;
}
const sis = fn => sistema(fn);

/* ---------- login ---------- */
r.post('/login', limiteLogin, rota(async (req, res) => {
  const email = texto(req.body && req.body.email, 120).toLowerCase();
  const a = await sis(async c => (await c.query('SELECT * FROM admins WHERE email = $1', [email])).rows[0]);
  const ok = a && a.ativo && await bcrypt.compare(String((req.body && req.body.senha) || ''), a.senha_hash);
  if (!ok) throw new ErroApp(401, 'E-mail ou senha incorretos.');
  res.json({ token: assinarAdmin(a), admin: { id: a.id, nome: a.nome, email: a.email } });
}));
r.use(exigirAdmin);
r.get('/eu', (req, res) => res.json({ admin: { id: req.admin.id, nome: req.admin.nome, email: req.admin.email }, recursos: RECURSOS }));

/* ---------- restaurantes ---------- */
r.get('/restaurantes', rota(async (req, res) => {
  const lista = await sis(async c => (await c.query(`
    SELECT r.*,
      (SELECT count(*)::int FROM produtos p WHERE p.restaurante_id = r.id) AS n_produtos,
      (SELECT count(*)::int FROM usuarios u WHERE u.restaurante_id = r.id) AS n_equipe,
      (SELECT count(*)::int FROM pedidos p WHERE p.restaurante_id = r.id AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= date_trunc('day', now() AT TIME ZONE r.fuso) AT TIME ZONE r.fuso) AS pedidos_hoje,
      (SELECT count(*)::int FROM pedidos p WHERE p.restaurante_id = r.id AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= now() - interval '30 days') AS pedidos_30,
      (SELECT coalesce(sum(total), 0) FROM pedidos p WHERE p.restaurante_id = r.id AND p.status NOT IN ('cancelado', 'aguardando') AND p.criado_em >= now() - interval '30 days') AS fat_30,
      (SELECT max(criado_em) FROM pedidos p WHERE p.restaurante_id = r.id AND p.criado_em >= now() - interval '30 days') AS ultimo
    FROM restaurantes r ORDER BY r.nome`)).rows);
  res.json({ restaurantes: lista.map(x => { const o = repo.restObj(x, []); return { id: o.id, nome: o.nome, slug: o.slug, cor: o.cor, ativo: o.ativo, plano: o.plano, recursos: o.recursos, criadoEm: o.createdAt,
    produtos: x.n_produtos, equipe: x.n_equipe, pedidosHoje: x.pedidos_hoje, pedidos30: x.pedidos_30, faturamento30: centavos(x.fat_30), ultimoPedido: x.ultimo }; }) });
}));

r.post('/restaurantes', rota(async (req, res) => {
  const b = req.body || {};
  const slug = texto(b.slug, 60).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ErroApp(400, 'O endereço deve ter só letras minúsculas, números e hífens. Ex.: pizzaria-do-ze');
  if (!/^\S+@\S+\.\S+$/.test(texto(b.email, 120))) throw new ErroApp(400, 'Informe um e-mail válido para o dono.');
  const rest = await sis(async c => {
    try {
      const { rest } = await criarRestaurante(c, { nome: texto(b.nome, 80), slug, email: texto(b.email, 120), senha: String(b.senha || ''), nomeDono: texto(b.donoNome, 60) || 'Dono', mesas: Math.min(200, Math.max(0, Math.trunc(numero(b.mesas, 10)))), extras: { plano: texto(b.plano, 40) || 'Básico' } });
      await registrar(c, req, rest, 'Restaurante criado', 'Dono: ' + texto(b.email, 120).toLowerCase());
      return rest;
    } catch (e) { if (e instanceof ErroApp) throw e; throw new ErroApp(400, e.message); }
  });
  res.status(201).json({ restaurante: { id: rest.id, slug: rest.slug } });
}));

r.get('/restaurantes/:id', rota(async (req, res) => {
  const out = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    const equipe = (await c.query('SELECT * FROM usuarios WHERE restaurante_id = $1 ORDER BY papel, nome', [rest.id])).rows.map(repo.usuarioPublico);
    const mesas = (await c.query('SELECT count(*)::int AS n FROM mesas WHERE restaurante_id = $1', [rest.id])).rows[0].n;
    return { restaurante: rest, equipe, mesas };
  });
  res.json(out);
}));

r.patch('/restaurantes/:id/situacao', rota(async (req, res) => {
  await sis(async c => {
    const rest = await restDe(c, req.params.id), b = req.body || {}, mud = [];
    if ('ativo' in b && !!b.ativo !== rest.ativo){
      const motivo = b.ativo ? '' : texto(b.motivo, 200);
      await c.query('UPDATE restaurantes SET ativo = $2, motivo_suspensao = $3 WHERE id = $1', [rest.id, !!b.ativo, motivo]);
      mud.push(b.ativo ? 'Restaurante reativado' : 'Restaurante suspenso' + (motivo ? ' (' + motivo + ')' : ''));
    }
    if ('plano' in b && texto(b.plano, 40) !== rest.plano){ await c.query('UPDATE restaurantes SET plano = $2 WHERE id = $1', [rest.id, texto(b.plano, 40)]); mud.push('Plano: ' + rest.plano + ' → ' + texto(b.plano, 40)); }
    if ('observacoes' in b && texto(b.observacoes, 2000) !== rest.observacoes){ await c.query('UPDATE restaurantes SET observacoes = $2 WHERE id = $1', [rest.id, texto(b.observacoes, 2000)]); mud.push('Observações internas atualizadas'); }
    if (mud.length) await registrar(c, req, rest, 'Situação alterada', mud.join(' · '));
  });
  res.json({ ok: true });
}));

r.put('/restaurantes/:id/recursos', rota(async (req, res) => {
  const recursos = await sis(async c => {
    const rest = await restDe(c, req.params.id), atual = recursosDe(rest), b = req.body || {}, mud = [];
    for (const k of Object.keys(RECURSOS)) if (k in b && !!b[k] !== atual[k]){ await c.query('UPDATE restaurantes SET rec_' + k + ' = $2 WHERE id = $1', [rest.id, !!b[k]]); mud.push(RECURSOS[k] + ': ' + (b[k] ? 'ativado' : 'desativado')); }
    if (mud.length) await registrar(c, req, rest, 'Funções alteradas', mud.join(' · '));
    return recursosDe(await repo.carregarRest(c, rest.id));
  });
  res.json({ recursos });
}));

r.put('/restaurantes/:id/config', rota(async (req, res) => {
  const mud = limparConfig(req.body);
  await sis(async c => {
    const antes = await restDe(c, req.params.id);
    const nomes = { nome: 'nome', frase: 'frase', cor: 'cor', logoUrl: 'logo', whatsapp: 'WhatsApp', chavePix: 'chave Pix', abre: 'abertura', fecha: 'fechamento', aceitarForaDoHorario: 'pedidos fora do horário', taxaServico: 'taxa de serviço', categorias: 'categorias', delivery: 'delivery' };
    const alterados = Object.keys(mud).filter(k => JSON.stringify(mud[k]) !== JSON.stringify(antes[k]));
    await repo.salvarConfig(c, antes.id, mud);
    if (alterados.length) await registrar(c, req, antes, 'Configurações alteradas', 'Campos: ' + alterados.map(k => nomes[k] || k).join(', '));
  });
  res.json({ ok: true });
}));

/* ---------- catálogo ---------- */
r.get('/restaurantes/:id/produtos', rota(async (req, res) => {
  res.json(await sis(async c => { const rest = await restDe(c, req.params.id); return { produtos: await repo.listarProdutos(c, rest.id), categorias: rest.categorias }; }));
}));
r.post('/restaurantes/:id/produtos', rota(async (req, res) => {
  const dados = limparProduto(req.body || {});
  const p = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    const p = await repo.criarProduto(c, rest.id, dados); await repo.adicionarCategoria(c, rest.id, dados.categoria);
    await registrar(c, req, rest, 'Produto criado', p.nome + ' · ' + reais(p.preco));
    return p;
  });
  res.status(201).json({ produto: p });
}));
async function prodDe(c, rest, pid) {
  if (!uuidValido(pid)) throw new ErroApp(404, 'Produto não encontrado.');
  const p = await repo.buscarProduto(c, rest.id, pid);
  if (!p) throw new ErroApp(404, 'Produto não encontrado.');
  return p;
}
r.put('/restaurantes/:id/produtos/:pid', rota(async (req, res) => {
  const dados = limparProduto(req.body || {});
  const p = await sis(async c => {
    const rest = await restDe(c, req.params.id), antes = await prodDe(c, rest, req.params.pid), det = [];
    if (antes.nome !== dados.nome) det.push('nome: ' + antes.nome + ' → ' + dados.nome);
    if (antes.preco !== dados.preco) det.push('preço: ' + reais(antes.preco) + ' → ' + reais(dados.preco));
    if (antes.categoria !== dados.categoria) det.push('categoria: ' + antes.categoria + ' → ' + dados.categoria);
    if (antes.descricao !== dados.descricao) det.push('descrição');
    if (JSON.stringify(antes.opcoes) !== JSON.stringify(dados.opcoes)) det.push('opções e adicionais');
    if (antes.esgotado !== dados.esgotado) det.push(dados.esgotado ? 'marcado como esgotado' : 'disponível de novo');
    const p = await repo.atualizarProduto(c, rest.id, antes.id, dados); await repo.adicionarCategoria(c, rest.id, dados.categoria);
    await registrar(c, req, rest, 'Produto editado', p.nome + (det.length ? ' · ' + det.join(', ') : ''));
    return p;
  });
  res.json({ produto: p });
}));
r.patch('/restaurantes/:id/produtos/:pid', rota(async (req, res) => {
  const p = await sis(async c => {
    const rest = await restDe(c, req.params.id), antes = await prodDe(c, rest, req.params.pid), b = req.body || {}, mud = {}, det = [];
    if ('preco' in b){ const v = centavos(numero(b.preco, -1)); if (!(v >= 0)) throw new ErroApp(400, 'Preço inválido.'); if (v !== antes.preco){ mud.preco = v; det.push('preço: ' + reais(antes.preco) + ' → ' + reais(v)); } }
    if ('esgotado' in b && !!b.esgotado !== antes.esgotado){ mud.esgotado = !!b.esgotado; det.push(mud.esgotado ? 'marcado como esgotado' : 'disponível de novo'); }
    if ('destaque' in b && !!b.destaque !== antes.destaque){ mud.destaque = !!b.destaque; det.push(mud.destaque ? 'virou destaque' : 'saiu dos destaques'); }
    const p = await repo.ajustarProduto(c, rest.id, antes.id, mud);
    if (det.length) await registrar(c, req, rest, 'Produto editado', p.nome + ' · ' + det.join(', '));
    return p;
  });
  res.json({ produto: p });
}));
r.delete('/restaurantes/:id/produtos/:pid', rota(async (req, res) => {
  await sis(async c => {
    const rest = await restDe(c, req.params.id), p = await prodDe(c, rest, req.params.pid);
    await c.query('DELETE FROM produtos WHERE id = $1 AND restaurante_id = $2', [p.id, rest.id]);
    await registrar(c, req, rest, 'Produto removido', p.nome + ' · ' + reais(p.preco));
  });
  res.json({ ok: true });
}));

/* ---------- acessos do restaurante ---------- */
r.post('/restaurantes/:id/equipe', rota(async (req, res) => {
  const b = req.body || {};
  const nome = texto(b.nome, 60), email = texto(b.email, 120).toLowerCase(), senha = String(b.senha || ''), papel = ['dono', 'cozinha', 'entregador'].includes(b.papel) ? b.papel : null;
  if (!nome || !/^\S+@\S+\.\S+$/.test(email)) throw new ErroApp(400, 'Informe nome e um e-mail válido.');
  if (senha.length < 8) throw new ErroApp(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (!papel) throw new ErroApp(400, 'Escolha a função da pessoa.');
  const hash = await bcrypt.hash(senha, 10);
  const u = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    if ((await c.query('SELECT 1 FROM usuarios WHERE email = $1', [email])).rowCount) throw new ErroApp(409, 'Já existe uma conta com esse e-mail.');
    const u = (await c.query('INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *', [rest.id, nome, email, papel, hash])).rows[0];
    await registrar(c, req, rest, 'Acesso criado', nome + ' (' + papel + ') · ' + email);
    return u;
  });
  res.status(201).json({ usuario: repo.usuarioPublico(u) });
}));
async function userDe(c, rest, uid) {
  if (!uuidValido(uid)) throw new ErroApp(404, 'Pessoa não encontrada.');
  const u = (await c.query('SELECT * FROM usuarios WHERE id = $1 AND restaurante_id = $2', [uid, rest.id])).rows[0];
  if (!u) throw new ErroApp(404, 'Pessoa não encontrada.');
  return u;
}
r.patch('/restaurantes/:id/equipe/:uid', rota(async (req, res) => {
  const u = await sis(async c => {
    const rest = await restDe(c, req.params.id), u = await userDe(c, rest, req.params.uid), ativo = !!(req.body && req.body.ativo);
    const n = (await c.query('UPDATE usuarios SET ativo = $2 WHERE id = $1 RETURNING *', [u.id, ativo])).rows[0];
    await registrar(c, req, rest, ativo ? 'Acesso reativado' : 'Acesso desativado', u.nome + ' · ' + u.email);
    return n;
  });
  res.json({ usuario: repo.usuarioPublico(u) });
}));
r.post('/restaurantes/:id/equipe/:uid/senha', rota(async (req, res) => {
  const senha = String((req.body && req.body.senha) || '');
  if (senha.length < 8) throw new ErroApp(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  const hash = await bcrypt.hash(senha, 10);
  await sis(async c => {
    const rest = await restDe(c, req.params.id), u = await userDe(c, rest, req.params.uid);
    await c.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [u.id, hash]);
    await registrar(c, req, rest, 'Senha redefinida', u.nome + ' · ' + u.email);
  });
  res.json({ ok: true });
}));

/* ---------- consultas ---------- */
r.get('/restaurantes/:id/pedidos', rota(async (req, res) => {
  const limite = Math.min(200, Math.max(1, Math.trunc(numero(req.query.limite, 30))));
  const pedidos = await sis(async c => { const rest = await restDe(c, req.params.id); return repo.completarPedidos(c, (await c.query('SELECT * FROM pedidos WHERE restaurante_id = $1 ORDER BY criado_em DESC LIMIT $2', [rest.id, limite])).rows, { cpfCompleto: true }); });
  res.json({ pedidos });
}));
r.get('/restaurantes/:id/historico', rota(async (req, res) => {
  const h = await sis(async c => { const rest = await restDe(c, req.params.id); return (await c.query('SELECT * FROM auditoria WHERE restaurante_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 200', [rest.id])).rows; });
  res.json({ historico: h.map(auditoriaObj) });
}));
r.get('/historico', rota(async (req, res) => {
  const h = await sis(async c => (await c.query('SELECT * FROM auditoria ORDER BY criado_em DESC, id DESC LIMIT 100')).rows);
  res.json({ historico: h.map(auditoriaObj) });
}));

/* ---------- equipe de devs ---------- */
const devObj = a => ({ id: a.id, nome: a.nome, email: a.email, ativo: a.ativo });
r.get('/devs', rota(async (req, res) => {
  res.json({ devs: (await sis(async c => (await c.query('SELECT * FROM admins ORDER BY nome')).rows)).map(devObj) });
}));
r.post('/devs', rota(async (req, res) => {
  const b = req.body || {}, nome = texto(b.nome, 60), email = texto(b.email, 120).toLowerCase(), senha = String(b.senha || '');
  if (!nome || !/^\S+@\S+\.\S+$/.test(email)) throw new ErroApp(400, 'Informe nome e um e-mail válido.');
  if (senha.length < 10) throw new ErroApp(400, 'A senha de dev precisa ter pelo menos 10 caracteres.');
  const hash = await bcrypt.hash(senha, 10);
  const a = await sis(async c => {
    if ((await c.query('SELECT 1 FROM admins WHERE email = $1', [email])).rowCount) throw new ErroApp(409, 'Já existe um dev com esse e-mail.');
    const a = (await c.query('INSERT INTO admins (nome, email, senha_hash) VALUES ($1,$2,$3) RETURNING *', [nome, email, hash])).rows[0];
    await registrar(c, req, null, 'Dev adicionado', nome + ' · ' + email);
    return a;
  });
  res.status(201).json({ dev: devObj(a) });
}));
r.patch('/devs/:aid', rota(async (req, res) => {
  if (!uuidValido(req.params.aid)) throw new ErroApp(404, 'Dev não encontrado.');
  if (String(req.params.aid) === String(req.admin.id)) throw new ErroApp(400, 'Você não pode desativar a própria conta.');
  const a = await sis(async c => {
    const a = (await c.query('UPDATE admins SET ativo = $2 WHERE id = $1 RETURNING *', [req.params.aid, !!(req.body && req.body.ativo)])).rows[0];
    if (!a) throw new ErroApp(404, 'Dev não encontrado.');
    await registrar(c, req, null, a.ativo ? 'Dev reativado' : 'Dev desativado', a.nome + ' · ' + a.email);
    return a;
  });
  res.json({ dev: devObj(a) });
}));

module.exports = r;
