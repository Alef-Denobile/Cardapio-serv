// Contas de cliente do ChefOnline: só para quem paga a entrega pelo site.
// Mesa, retirada e entrega paga na porta continuam sem cadastro.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sistema } = require('../db');
const repo = require('../lib/repo');
const { ErroApp, rota, texto, numero, uuidValido, cpfValido, soDigitos, mascararCpf } = require('../lib/util');

const r = express.Router();
const limite = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' } });
const assinar = c => jwt.sign({ sub: String(c.id), tipo: 'cliente' }, config.jwtSecret, { expiresIn: '30d' });
const publico = c => ({ id: c.id, nome: c.nome, email: c.email, telefone: c.telefone, cpf: mascararCpf(c.cpf), temCpf: !!c.cpf });
const conferirCpf = v => { const d = soDigitos(v); if (!cpfValido(d)) throw new ErroApp(400, d ? 'CPF inválido. Confira os números.' : 'Informe seu CPF.'); return d; };
const conferirTel = v => { const t = texto(v, 20); if (t.replace(/\D/g, '').length < 10) throw new ErroApp(400, 'Informe seu WhatsApp com DDD.'); return t; };

// Lê o cliente do token (usado aqui e na criação de pedidos)
async function clienteDoToken(req, obrigatorio) {
  if (!config.clienteContas && !obrigatorio) return null; // contas desligadas: todo pedido é sem cadastro
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) { if (obrigatorio) throw new ErroApp(401, 'Entre na sua conta para continuar.'); return null; }
  let d; try { d = jwt.verify(token, config.jwtSecret); } catch (e) { if (obrigatorio) throw new ErroApp(401, 'Sua sessão expirou. Entre de novo.'); return null; }
  if (d.tipo !== 'cliente') { if (obrigatorio) throw new ErroApp(401, 'Entre com a sua conta de cliente.'); return null; }
  const c = await sistema(async x => (await x.query('SELECT * FROM clientes WHERE id = $1 AND ativo', [d.sub])).rows[0]);
  if (!c && obrigatorio) throw new ErroApp(401, 'Conta não encontrada. Entre de novo.');
  return c || null;
}
const exigirCliente = (req, res, next) => clienteDoToken(req, true).then(c => { req.cliente = c; next(); }).catch(next);

r.post('/cadastro', limite, rota(async (req, res) => {
  const b = req.body || {};
  const email = texto(b.email, 120).toLowerCase(), senha = String(b.senha || '');
  const nome = texto(b.nome, 60) || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, x => x.toUpperCase()).split(' ')[0];
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroApp(400, 'Informe um e-mail válido, como nome@email.com.');
  if (senha.length < 8) throw new ErroApp(400, 'A senha precisa ter pelo menos 8 caracteres.');
  const telefone = conferirTel(b.telefone), cpf = conferirCpf(b.cpf);
  const hash = await bcrypt.hash(senha, 10);
  const c = await sistema(async x => {
    if ((await x.query('SELECT 1 FROM clientes WHERE email = $1', [email])).rowCount) throw new ErroApp(409, 'Já existe uma conta com esse e-mail. Use "Já tenho conta".');
    if ((await x.query('SELECT 1 FROM clientes WHERE cpf = $1', [cpf])).rowCount) throw new ErroApp(409, 'Já existe uma conta com esse CPF. Use "Já tenho conta".');
    return (await x.query('INSERT INTO clientes (nome, email, senha_hash, telefone, cpf) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nome, email, hash, telefone, cpf])).rows[0];
  });
  res.status(201).json({ token: assinar(c), cliente: publico(c) });
}));

r.post('/login', limite, rota(async (req, res) => {
  const email = texto(req.body && req.body.email, 120).toLowerCase();
  const c = await sistema(async x => (await x.query('SELECT * FROM clientes WHERE email = $1', [email])).rows[0]);
  const ok = c && c.ativo && await bcrypt.compare(String((req.body && req.body.senha) || ''), c.senha_hash);
  if (!ok) throw new ErroApp(401, 'E-mail ou senha incorretos.');
  res.json({ token: assinar(c), cliente: publico(c) });
}));

r.get('/eu', exigirCliente, rota(async (req, res) => {
  const favs = await sistema(async x => (await x.query('SELECT r.slug FROM favoritos f JOIN restaurantes r ON r.id = f.restaurante_id WHERE f.cliente_id = $1', [req.cliente.id])).rows.map(y => y.slug));
  res.json({ cliente: publico(req.cliente), favoritos: favs });
}));
r.patch('/eu', exigirCliente, rota(async (req, res) => {
  const b = req.body || {};
  const tel = b.telefone === undefined ? null : conferirTel(b.telefone);
  // o CPF só pode ser informado uma vez (contas antigas sem CPF); depois, só o suporte altera
  const cpf = b.cpf === undefined || req.cliente.cpf ? null : conferirCpf(b.cpf);
  let c;
  try { c = await sistema(async x => (await x.query('UPDATE clientes SET nome = COALESCE(NULLIF($2, \'\'), nome), telefone = COALESCE($3, telefone), cpf = COALESCE(cpf, $4) WHERE id = $1 RETURNING *', [req.cliente.id, texto(b.nome, 60), tel, cpf])).rows[0]); }
  catch (e) { if (e.code === '23505') throw new ErroApp(409, 'Esse CPF já está em outra conta.'); throw e; }
  res.json({ cliente: publico(c) });
}));

/* favoritos */
r.put('/favoritos/:slug', exigirCliente, rota(async (req, res) => {
  await sistema(async x => {
    const rest = (await x.query('SELECT id FROM restaurantes WHERE slug = $1', [texto(req.params.slug, 60)])).rows[0];
    if (!rest) throw new ErroApp(404, 'Restaurante não encontrado.');
    await x.query('INSERT INTO favoritos (cliente_id, restaurante_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.cliente.id, rest.id]);
  });
  res.json({ ok: true });
}));
r.delete('/favoritos/:slug', exigirCliente, rota(async (req, res) => {
  await sistema(x => x.query('DELETE FROM favoritos WHERE cliente_id = $1 AND restaurante_id = (SELECT id FROM restaurantes WHERE slug = $2)', [req.cliente.id, texto(req.params.slug, 60)]));
  res.json({ ok: true });
}));

/* meus pedidos (de todos os restaurantes) */
r.get('/pedidos', exigirCliente, rota(async (req, res) => {
  const lim = Math.min(50, Math.max(1, Math.trunc(numero(req.query.limite, 20))));
  const out = await sistema(async x => {
    const rows = (await x.query('SELECT * FROM pedidos WHERE cliente_id = $1 ORDER BY criado_em DESC LIMIT $2', [req.cliente.id, lim])).rows;
    const lista = await repo.completarPedidos(x, rows);
    const rests = new Map((await x.query('SELECT id, slug, nome, cor FROM restaurantes WHERE id = ANY($1)', [[...new Set(rows.map(y => y.restaurante_id))]])).rows.map(y => [y.id, y]));
    const avs = new Map((await x.query('SELECT pedido_id, nota, comentario FROM avaliacoes WHERE pedido_id = ANY($1)', [rows.map(y => y.id)])).rows.map(y => [y.pedido_id, y]));
    return lista.map((p, i) => { const rr = rests.get(rows[i].restaurante_id) || {}; const av = avs.get(p.id);
      return Object.assign({}, p, { restaurante: { slug: rr.slug, nome: rr.nome, cor: rr.cor }, codigo: rows[i].codigo_acomp, avaliacao: av ? { nota: av.nota, comentario: av.comentario } : null }); });
  });
  res.json({ pedidos: out });
}));

r.post('/pedidos/:id/avaliacao', exigirCliente, rota(async (req, res) => {
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const nota = Math.trunc(numero(req.body && req.body.nota, 0));
  if (nota < 1 || nota > 5) throw new ErroApp(400, 'Escolha de 1 a 5 estrelas.');
  await sistema(async x => {
    const p = (await x.query('SELECT id, restaurante_id, status FROM pedidos WHERE id = $1 AND cliente_id = $2', [req.params.id, req.cliente.id])).rows[0];
    if (!p) throw new ErroApp(404, 'Pedido não encontrado.');
    if (p.status !== 'entregue') throw new ErroApp(409, 'Você pode avaliar depois que o pedido for entregue.');
    if ((await x.query('SELECT 1 FROM avaliacoes WHERE pedido_id = $1', [p.id])).rowCount) throw new ErroApp(409, 'Este pedido já foi avaliado.');
    await x.query('INSERT INTO avaliacoes (restaurante_id, cliente_id, pedido_id, nota, comentario) VALUES ($1,$2,$3,$4,$5)', [p.restaurante_id, req.cliente.id, p.id, nota, texto(req.body.comentario, 400)]);
  });
  res.status(201).json({ ok: true });
}));

module.exports = { router: r, clienteDoToken };
