const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { sistema, doRestaurante } = require('../db');
const repo = require('../lib/repo');
const { assinar, exigir } = require('../middleware/auth');
const { ErroApp, rota, texto } = require('../lib/util');
const { recursosDe } = require('../lib/recursos');

const r = express.Router();
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas de entrar. Aguarde 15 minutos e tente de novo.' } });
const restResumo = rest => ({ nome: rest.nome, slug: rest.slug, cor: rest.cor, logoUrl: rest.logoUrl, recursos: recursosDe(rest), dominio: recursosDe(rest).dominio ? rest.dominio : '', fuso: rest.fuso, agendamento: { ativo: rest.agendamento.ativo, preparo: rest.agendamento.preparo } });

r.post('/login', limiteLogin, rota(async (req, res) => {
  const email = texto(req.body && req.body.email, 120).toLowerCase();
  const senha = String((req.body && req.body.senha) || '');
  const { u, rest } = await sistema(async c => {
    const u = (await c.query('SELECT * FROM usuarios WHERE email = $1', [email])).rows[0];
    return { u, rest: u ? await repo.carregarRest(c, u.restaurante_id) : null };
  });
  const ok = u && u.ativo && await bcrypt.compare(senha, u.senha_hash);
  if (!ok) throw new ErroApp(401, 'E-mail ou senha incorretos.');
  if (!rest || !rest.ativo) {
    if (rest && rest.suspensoCobranca && u.papel === 'dono') {
      const f = await sistema(async c => (await c.query("SELECT id, codigo FROM faturas WHERE restaurante_id = $1 AND status = 'aberta' ORDER BY vencimento LIMIT 1", [rest.id])).rows[0]);
      if (f) throw Object.assign(new ErroApp(403, 'O acesso está suspenso por mensalidade em atraso. Pague a fatura e o painel volta na hora.'), { extra: { fatura: '/fatura/' + f.id + '?c=' + encodeURIComponent(f.codigo) } });
    }
    throw new ErroApp(403, rest && rest.suspensoCobranca ? 'O acesso deste restaurante está suspenso por mensalidade em atraso. Avise o dono.' : 'O acesso deste restaurante está suspenso. Fale com o suporte.');
  }
  res.json({ token: assinar(u), usuario: repo.usuarioPublico(u), restaurante: restResumo(rest) });
}));

r.get('/eu', exigir(), rota(async (req, res) => {
  const rest = await doRestaurante(req.rid, c => repo.carregarRest(c, req.rid));
  res.json({ usuario: repo.usuarioPublico(req.usuario), restaurante: restResumo(rest) });
}));

// Trocar a própria senha (qualquer pessoa da equipe, já logada)
const limiteSenha = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' } });
r.post('/senha', limiteSenha, exigir(), rota(async (req, res) => {
  const atual = String((req.body && req.body.atual) || ''), nova = String((req.body && req.body.nova) || '');
  if (nova.length < 8) throw new ErroApp(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  await doRestaurante(req.rid, async c => {
    const u = (await c.query('SELECT senha_hash FROM usuarios WHERE id = $1 AND restaurante_id = $2', [req.usuario.id, req.rid])).rows[0];
    if (!u || !await bcrypt.compare(atual, u.senha_hash)) throw new ErroApp(400, 'A senha atual não confere.');
    await c.query('UPDATE usuarios SET senha_hash = $3, senha_alterada_em = now() WHERE id = $1 AND restaurante_id = $2', [req.usuario.id, req.rid, await bcrypt.hash(nova, 10)]);
  });
  res.json({ ok: true, token: assinar(Object.assign({}, req.usuario, { restaurante_id: req.rid })) }); // novo acesso para este aparelho
}));

module.exports = r;
