// "Esqueci minha senha" por e-mail, para a equipe do restaurante (painel) e para as contas de cliente.
// O link vale 1 hora e funciona uma única vez. No banco fica só o hash do código.
// A resposta é sempre a mesma, exista ou não a conta, para ninguém descobrir quais e-mails estão cadastrados.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { sistema } = require('../db');
const email = require('../lib/email');
const { ErroApp, rota, texto, urlBase, hashToken } = require('../lib/util');

const r = express.Router();
const limite = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitos pedidos de senha nova. Aguarde 15 minutos.' } });
const limiteTroca = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' } });
const VALIDADE_MIN = 60;
const RESPOSTA = 'Se esse e-mail estiver cadastrado, enviamos um link para criar uma senha nova. Ele vale por 1 hora. Confira também a caixa de spam.';
const TABELA = { usuario: 'usuarios', cliente: 'clientes' };

r.post('/esqueci', limite, rota(async (req, res) => {
  const b = req.body || {}, tipo = b.tipo === 'cliente' ? 'cliente' : 'usuario';
  const end = texto(b.email, 120).toLowerCase(), slug = texto(b.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!/^\S+@\S+\.\S+$/.test(end)) throw new ErroApp(400, 'Digite o seu e-mail para receber o link.');
  const base = urlBase(req);
  if (!base) { console.error('Esqueci minha senha: defina PUBLIC_URL para montar o link do e-mail.'); throw new ErroApp(422, 'Envio de senha nova indisponível agora. Fale com o suporte.'); }
  if (!email.ativo()) throw new ErroApp(422, 'O envio de e-mail ainda não foi configurado. Fale com o suporte para criar uma senha nova.');
  // responde na hora e faz o resto depois: o tempo de resposta não revela se o e-mail existe
  res.json({ ok: true, mensagem: RESPOSTA });
  processar(tipo, end, slug, base).catch(e => console.error('Esqueci minha senha:', e.message));
}));
async function processar(tipo, end, slug, base) {
  const envio = await sistema(async c => {
    const conta = (await c.query('SELECT x.id, x.nome, x.ativo' + (tipo === 'usuario' ? ', r.nome AS rest_nome' : '') + ' FROM ' + TABELA[tipo] + ' x' + (tipo === 'usuario' ? ' JOIN restaurantes r ON r.id = x.restaurante_id' : '') + ' WHERE x.email = $1', [end])).rows[0];
    if (!conta || !conta.ativo) return null;
    // no máximo 3 links por hora para a mesma conta
    const recentes = (await c.query("SELECT count(*)::int AS n FROM senha_tokens WHERE tipo = $1 AND conta_id = $2 AND criado_em > now() - interval '1 hour'", [tipo, conta.id])).rows[0].n;
    if (recentes >= 3) return null;
    await c.query('UPDATE senha_tokens SET usado_em = now() WHERE tipo = $1 AND conta_id = $2 AND usado_em IS NULL', [tipo, conta.id]); // link antigo para de valer
    const token = crypto.randomBytes(32).toString('base64url');
    await c.query("INSERT INTO senha_tokens (tipo, conta_id, hash, expira_em) VALUES ($1, $2, $3, now() + make_interval(mins => $4))", [tipo, conta.id, hashToken(token), VALIDADE_MIN]);
    return { conta, token };
  });
  if (envio) {
    const link = base + '/redefinir-senha?t=' + encodeURIComponent(envio.token) + (tipo === 'cliente' && slug ? '&r=' + encodeURIComponent(slug) : '');
    const ok = await email.enviar({ para: end, assunto: 'Crie uma senha nova', titulo: 'Olá, ' + String(envio.conta.nome || '').split(' ')[0] + '!',
      linhas: ['Recebemos um pedido para criar uma senha nova' + (envio.conta.rest_nome ? ' para o painel do ' + envio.conta.rest_nome : ' para a sua conta') + '.', 'O link vale por 1 hora e só funciona uma vez. Se não foi você, ignore este e-mail: a sua senha atual continua valendo.'],
      botao: 'Criar senha nova', link });
    if (!ok) console.error('Esqueci minha senha: o e-mail não saiu. Confira EMAIL_PROVEDOR.');
  }
}

async function tokenValido(c, token) {
  const t = texto(token, 100);
  if (t.length < 20) return null;
  return (await c.query('SELECT * FROM senha_tokens WHERE hash = $1 AND usado_em IS NULL AND expira_em > now()', [hashToken(t)])).rows[0] || null;
}
const mascarar = e => String(e || '').replace(/^(.{2})[^@]*(@.*)$/, (m, a, b) => a + '•••' + b);

r.post('/validar', limiteTroca, rota(async (req, res) => {
  const out = await sistema(async c => {
    const t = await tokenValido(c, req.body && req.body.t);
    if (!t) return { valido: false };
    const conta = (await c.query('SELECT email FROM ' + TABELA[t.tipo] + ' WHERE id = $1', [t.conta_id])).rows[0];
    return { valido: !!conta, tipo: t.tipo, email: conta ? mascarar(conta.email) : '' };
  });
  res.json(out);
}));

r.post('/redefinir', limiteTroca, rota(async (req, res) => {
  const b = req.body || {}, senha = String(b.senha || '');
  if (senha.length < 8) throw new ErroApp(400, 'A senha nova precisa ter pelo menos 8 caracteres.');
  if (senha.length > 200) throw new ErroApp(400, 'Senha longa demais.');
  const hash = await bcrypt.hash(senha, 10);
  const tipo = await sistema(async c => {
    // gasta o link na mesma operação que o confere: dois envios ao mesmo tempo não usam o mesmo link
    const tk = texto(b.token, 100);
    const t = tk.length < 20 ? null : (await c.query('UPDATE senha_tokens SET usado_em = now() WHERE hash = $1 AND usado_em IS NULL AND expira_em > now() RETURNING *', [hashToken(tk)])).rows[0];
    if (!t) throw new ErroApp(400, 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
    const ok = (await c.query('UPDATE ' + TABELA[t.tipo] + ' SET senha_hash = $2, senha_alterada_em = now() WHERE id = $1 AND ativo', [t.conta_id, hash])).rowCount;
    if (!ok) throw new ErroApp(400, 'Esta conta está desativada. Fale com o suporte.');
    await c.query('UPDATE senha_tokens SET usado_em = now() WHERE tipo = $1 AND conta_id = $2 AND usado_em IS NULL', [t.tipo, t.conta_id]);
    return t.tipo;
  });
  res.json({ ok: true, tipo });
}));

module.exports = r;
