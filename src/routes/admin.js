// Área de devs: gerencia todos os restaurantes da plataforma.
// Roda em contexto de sistema (enxerga todos) e registra toda alteração na auditoria.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sistema } = require('../db');
const repo = require('../lib/repo');
const { assinarAdmin, exigirAdmin } = require('../middleware/admin');
const { criarRestaurante } = require('../lib/criarRestaurante');
const { limparProduto, limparConfig } = require('../lib/dados');
const { RECURSOS, recursosDe } = require('../lib/recursos');
const { ErroApp, rota, texto, numero, centavos, uuidValido, tokenAleatorio, urlBase } = require('../lib/util');
const cobranca = require('../lib/cobranca');

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
    suspensoCobranca: o.suspensoCobranca, mensalidade: o.cobranca.ativa ? o.cobranca.valor : 0, produtos: x.n_produtos, equipe: x.n_equipe, pedidosHoje: x.pedidos_hoje, pedidos30: x.pedidos_30, faturamento30: centavos(x.fat_30), ultimoPedido: x.ultimo }; }) });
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
      await c.query('UPDATE restaurantes SET ativo = $2, motivo_suspensao = $3, suspenso_cobranca = false WHERE id = $1', [rest.id, !!b.ativo, motivo]);
      // reativou quem estava suspenso por atraso: 3 dias de carência antes de a rotina suspender de novo
      if (b.ativo && rest.suspensoCobranca) { await c.query("UPDATE restaurantes SET cobranca = cobranca || jsonb_build_object('carenciaAte', (now() + interval '3 days')::text) WHERE id = $1", [rest.id]); mud.push('3 dias de carência para pagar a mensalidade'); }
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
    require('../lib/dominios').limpar();
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
    { const comp = (antes.opcoes || []).filter(o => o.tipo === 'combo' || o.tipo === 'sabores'); if (comp.length && !dados.opcoes.some(o => o.tipo === 'combo' || o.tipo === 'sabores')) dados.opcoes = dados.opcoes.concat(comp); }
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
    await c.query('UPDATE usuarios SET senha_hash = $2, senha_alterada_em = now() WHERE id = $1', [u.id, hash]);
    await registrar(c, req, rest, 'Senha redefinida', u.nome + ' · ' + u.email);
  });
  res.json({ ok: true });
}));

/* ---------- mesas, QR Codes e totem ---------- */
const listarMesas = async (c, rid) => (await c.query('SELECT numero, token FROM mesas WHERE restaurante_id = $1 ORDER BY numero', [rid])).rows;
async function tokenTotem(c, rest) {
  const atual = (await c.query('SELECT totem_token FROM restaurantes WHERE id = $1', [rest.id])).rows[0].totem_token;
  if (atual) return atual;
  return (await c.query('UPDATE restaurantes SET totem_token = $2 WHERE id = $1 RETURNING totem_token', [rest.id, tokenAleatorio(12)])).rows[0].totem_token;
}
r.get('/restaurantes/:id/mesas', rota(async (req, res) => {
  res.json(await sis(async c => { const rest = await restDe(c, req.params.id); return { mesas: await listarMesas(c, rest.id), totem: await tokenTotem(c, rest) }; }));
}));
r.post('/restaurantes/:id/mesas', rota(async (req, res) => {
  const q = Math.trunc(numero(req.body && req.body.quantidade, -1));
  if (q < 0 || q > 200) throw new ErroApp(400, 'Informe entre 0 e 200 mesas.');
  const mesas = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    const existentes = new Set((await c.query('SELECT numero FROM mesas WHERE restaurante_id = $1', [rest.id])).rows.map(m => m.numero));
    for (let n = 1; n <= q; n++) if (!existentes.has(n)) await c.query('INSERT INTO mesas (restaurante_id, numero, token) VALUES ($1, $2, $3)', [rest.id, n, tokenAleatorio()]);
    await c.query('DELETE FROM mesas WHERE restaurante_id = $1 AND numero > $2', [rest.id, q]);
    if (q !== existentes.size) await registrar(c, req, rest, 'Mesas alteradas', existentes.size + ' → ' + q + ' mesas');
    return listarMesas(c, rest.id);
  });
  res.json({ mesas });
}));
r.post('/restaurantes/:id/mesas/:numero/novo-codigo', rota(async (req, res) => {
  const m = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    const m = (await c.query('UPDATE mesas SET token = $3 WHERE restaurante_id = $1 AND numero = $2 RETURNING numero, token', [rest.id, Math.trunc(numero(req.params.numero)), tokenAleatorio()])).rows[0];
    if (!m) throw new ErroApp(404, 'Mesa não encontrada.');
    await registrar(c, req, rest, 'Novo QR de mesa', 'Mesa ' + String(m.numero).padStart(2, '0') + ': o QR antigo parou de funcionar');
    return m;
  });
  res.json({ mesa: m });
}));
r.post('/restaurantes/:id/totem/novo-codigo', rota(async (req, res) => {
  const t = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    const t = (await c.query('UPDATE restaurantes SET totem_token = $2 WHERE id = $1 RETURNING totem_token', [rest.id, tokenAleatorio(12)])).rows[0].totem_token;
    await registrar(c, req, rest, 'Novo link do totem', 'O link antigo do totem parou de funcionar');
    return t;
  });
  res.json({ token: t });
}));

/* ---------- domínio próprio ---------- */
const dominios = require('../lib/dominios');
r.put('/restaurantes/:id/dominio', rota(async (req, res) => {
  const d = dominios.normalizar(req.body && req.body.dominio);
  if (d && !dominios.valido(d)) throw new ErroApp(400, 'Domínio inválido. Use só o endereço, como pizzariadoze.com.br.');
  let alvo = ''; try { alvo = config.dominioAlvo || (config.urlPublica ? new URL(config.urlPublica).hostname : ''); } catch (e) {}
  if (d && dominios.daPlataforma(d)) throw new ErroApp(400, 'Esse é o endereço da plataforma. Informe o domínio do restaurante.');
  const out = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    try { await c.query('UPDATE restaurantes SET dominio = $2 WHERE id = $1', [rest.id, d || null]); }
    catch (e) { if (e.code === '23505') throw new ErroApp(409, 'Esse domínio já está em outro restaurante.'); throw e; }
    await registrar(c, req, rest, 'Domínio próprio', d ? (rest.dominio ? rest.dominio + ' → ' : '') + d : 'Removido (' + (rest.dominio || '-') + ')');
    return d;
  });
  dominios.limpar();
  res.json({ dominio: out, alvo });
}));
r.post('/restaurantes/:id/dominio/verificar', rota(async (req, res) => {
  const rest = await sis(c => restDe(c, req.params.id));
  if (!rest.dominio) throw new ErroApp(400, 'Cadastre o domínio primeiro.');
  res.json(await dominios.verificar(rest.dominio));
}));

/* ---------- importar cardápio ---------- */
const importar = require('../lib/importar');
const brutoImp = express.raw({ type: () => true, limit: '8mb' });
r.get('/modelo-cardapio.xlsx', rota(async (req, res) => {
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="modelo-cardapio.xlsx"' }).send(await importar.modelo());
}));
r.post('/restaurantes/:id/importar/planilha', brutoImp, rota(async (req, res) => {
  await sis(c => restDe(c, req.params.id));
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ErroApp(400, 'Escolha o arquivo da planilha.');
  res.json(await importar.planilha(req.body, req.get('content-type') || ''));
}));
r.post('/restaurantes/:id/importar/foto', brutoImp, rota(async (req, res) => {
  await sis(c => restDe(c, req.params.id));
  const b = req.body;
  if (!Buffer.isBuffer(b) || b.length < 100) throw new ErroApp(400, 'Escolha a foto do cardápio.');
  const img = (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50) || (b.slice(8, 12).toString() === 'WEBP');
  if (!img) throw new ErroApp(400, 'Envie uma foto em JPG, PNG ou WEBP.');
  res.json(await importar.foto(b, req.get('content-type') || ''));
}));
const jsonGrande = express.json({ limit: '6mb' }); // depois do login de dev
r.post('/restaurantes/:id/importar/ifood', jsonGrande, rota(async (req, res) => {
  await sis(c => restDe(c, req.params.id));
  res.json(await importar.ifood({ url: req.body && req.body.url, json: req.body && req.body.json }));
}));
// Grava a lista revisada. Produto com o mesmo nome na mesma categoria: pula, ou atualiza o preço se pedido.
r.post('/restaurantes/:id/importar', jsonGrande, rota(async (req, res) => {
  const b = req.body || {}, itens = importar.normalizar(Array.isArray(b.itens) ? b.itens : []);
  if (!itens.length) throw new ErroApp(400, 'Nenhum item para importar.');
  const out = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    const atuais = new Map((await c.query('SELECT id, nome, categoria, preco FROM produtos WHERE restaurante_id = $1', [rest.id])).rows.map(x => [(x.categoria + '|' + x.nome).toLowerCase(), x]));
    let criados = 0, atualizados = 0, ignorados = 0;
    for (const i of itens) {
      const ja = atuais.get((i.categoria + '|' + i.nome).toLowerCase());
      if (ja) { if (b.atualizarPrecos && Number(ja.preco) !== i.preco) { await c.query('UPDATE produtos SET preco = $2 WHERE id = $1', [ja.id, i.preco]); atualizados++; } else ignorados++; continue; }
      await repo.criarProduto(c, rest.id, { categoria: i.categoria, nome: i.nome, descricao: i.descricao, preco: i.preco, selos: [], opcoes: [], fotoUrl: i.fotoUrl, esgotado: false, destaque: false, sugerir: false, fiscal: {} });
      await repo.adicionarCategoria(c, rest.id, i.categoria); criados++;
    }
    await registrar(c, req, rest, 'Cardápio importado', (b.fonte ? b.fonte + ': ' : '') + criados + ' produto(s) novos, ' + atualizados + ' preço(s) atualizados, ' + ignorados + ' já existiam');
    return { criados, atualizados, ignorados };
  });
  res.json(out);
}));

/* ---------- mensalidade ---------- */
const listarFaturas = async (c, rid) => (await c.query(cobranca.SELECT_F + ' WHERE f.restaurante_id = $1 ORDER BY f.competencia DESC LIMIT 24', [rid])).rows.map(cobranca.faturaObj);
r.get('/restaurantes/:id/cobranca', rota(async (req, res) => {
  const base = urlBase(req);
  res.json(await sis(async c => { const rest = await restDe(c, req.params.id); const faturas = await listarFaturas(c, rest.id);
    return { cobranca: rest.cobranca, suspensoCobranca: rest.suspensoCobranca, faturas: faturas.map(f => Object.assign(f, { link: (base || '') + '/fatura/' + f.id + '?c=' + encodeURIComponent(f.codigo) })), provedor: config.cobranca.provedor, emailAtivo: require('../lib/email').ativo() }; }));
}));
r.put('/restaurantes/:id/cobranca', rota(async (req, res) => {
  const b = req.body || {};
  const valor = centavos(Math.max(0, numero(b.valor, 0))), dia = Math.trunc(numero(b.dia, 10)), tol = Math.trunc(numero(b.tolerancia, 5));
  if (b.ativa && !(valor > 0)) throw new ErroApp(400, 'Informe o valor da mensalidade.');
  if (dia < 1 || dia > 28) throw new ErroApp(400, 'O dia do vencimento vai de 1 a 28.');
  if (tol < 0 || tol > 30) throw new ErroApp(400, 'A tolerância vai de 0 a 30 dias.');
  const out = await sis(async c => {
    const rest = await restDe(c, req.params.id), nova = { ativa: !!b.ativa, valor, dia, tolerancia: tol };
    await c.query('UPDATE restaurantes SET cobranca = $2 WHERE id = $1', [rest.id, nova]);
    await registrar(c, req, rest, 'Mensalidade alterada', (nova.ativa ? 'Ativa' : 'Desligada') + ' · ' + reais(valor) + ' · vence dia ' + dia + ' · tolerância ' + tol + ' dia(s)');
    const atual = await repo.carregarRest(c, rest.id);
    await cobranca.ajustarSituacao(c, atual); // desligar a cobrança reativa quem estava suspenso por atraso
    return repo.carregarRest(c, rest.id);
  });
  res.json({ cobranca: out.cobranca, ativo: out.ativo });
}));
r.post('/restaurantes/:id/faturas', rota(async (req, res) => {
  const f = await sis(async c => {
    const rest = await restDe(c, req.params.id);
    if (!rest.cobranca.ativa) throw new ErroApp(400, 'Ative a mensalidade antes de gerar a fatura.');
    const f = await cobranca.gerarFatura(c, rest, true);
    if (!f) throw new ErroApp(409, 'A fatura deste mês já existe.');
    await registrar(c, req, rest, 'Fatura gerada', cobranca.mesTxt(f.competencia) + ' · ' + reais(f.valor));
    return f;
  });
  res.status(201).json({ fatura: cobranca.faturaObj(f) });
}));
async function faturaDe(c, fid) {
  if (!uuidValido(fid)) throw new ErroApp(404, 'Fatura não encontrada.');
  const f = (await c.query('SELECT f.*, r.nome AS rest_nome FROM faturas f JOIN restaurantes r ON r.id = f.restaurante_id WHERE f.id = $1', [fid])).rows[0];
  if (!f) throw new ErroApp(404, 'Fatura não encontrada.');
  return f;
}
r.post('/faturas/:fid/paga', rota(async (req, res) => {
  const obs = texto(req.body && req.body.obs, 200), f0 = await sis(c => faturaDe(c, req.params.fid));
  const out = await cobranca.darBaixa(f0.id, 'manual', obs);
  if (!out) throw new ErroApp(409, 'Esta fatura não está em aberto.');
  await sis(async c => registrar(c, req, { id: f0.restaurante_id, nome: f0.rest_nome }, 'Fatura paga (baixa manual)', cobranca.mesTxt(f0.competencia) + ' · ' + reais(f0.valor) + (obs ? ' · ' + obs : '') + (out.situacao === 'reativado' ? ' · restaurante reativado' : '')));
  res.json({ ok: true, situacao: out.situacao });
}));
r.post('/faturas/:fid/cancelar', rota(async (req, res) => {
  await sis(async c => {
    const f = await faturaDe(c, req.params.fid);
    const u = (await c.query("UPDATE faturas SET status = 'cancelada' WHERE id = $1 AND status = 'aberta' RETURNING *", [f.id])).rows[0];
    if (!u) throw new ErroApp(409, 'Esta fatura não está em aberto.');
    await registrar(c, req, { id: f.restaurante_id, nome: f.rest_nome }, 'Fatura cancelada', cobranca.mesTxt(f.competencia) + ' · ' + reais(f.valor));
    await cobranca.ajustarSituacao(c, await repo.carregarRest(c, f.restaurante_id));
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
