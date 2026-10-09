const jwt = require('jsonwebtoken');
const config = require('../config');
const { sistema } = require('../db');
const { ErroApp } = require('../lib/util');
const { recursosDe, recursosDaLinha } = require('../lib/recursos');

function assinar(u) {
  return jwt.sign({ sub: String(u.id), rid: String(u.restaurante_id), papel: u.papel }, config.jwtSecret, { expiresIn: config.jwtValidade });
}
function verificar(token) { return jwt.verify(token, config.jwtSecret); }

// Carrega a pessoa e o restaurante dela a partir do token
async function identificar(token) {
  let d;
  try { d = verificar(token); } catch (e) { throw new ErroApp(401, 'Sua sessão expirou. Entre de novo.'); }
  if (d.tipo === 'admin' || d.tipo === 'cliente') throw new ErroApp(401, 'Entre com uma conta do restaurante.');
  return sistema(async c => {
    const u = (await c.query('SELECT u.*, row_to_json(r) AS rest_row FROM usuarios u JOIN restaurantes r ON r.id = u.restaurante_id WHERE u.id = $1', [d.sub])).rows[0];
    if (!u || !u.ativo) throw new ErroApp(401, 'Acesso desativado. Fale com o dono do restaurante.');
    if (u.senha_alterada_em && d.iat && d.iat * 1000 < new Date(u.senha_alterada_em).getTime() - 2000) throw new ErroApp(401, 'Sua senha foi trocada. Entre de novo.');
    if (!u.rest_row.ativo) throw new ErroApp(403, u.rest_row.suspenso_cobranca ? 'O acesso deste restaurante está suspenso por mensalidade em atraso. Pague a fatura pelo link enviado ou fale com o suporte.' : 'O acesso deste restaurante está suspenso. Fale com o suporte.');
    const usuario = { id: u.id, _id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo, restaurante: u.restaurante_id };
    const rest = { nome: u.rest_row.nome, ativo: u.rest_row.ativo, recursos: recursosDaLinha(u.rest_row) };
    rest.recursos = recursosDe(rest);
    return { usuario, rest };
  });
}

// exigir() = qualquer pessoa logada; exigir('dono') = só o dono, etc.
function exigir(...papeis) {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      if (!token) throw new ErroApp(401, 'Entre com seu e-mail e senha.');
      const { usuario, rest } = await identificar(token);
      if (papeis.length && !papeis.includes(usuario.papel)) throw new ErroApp(403, 'Você não tem permissão para fazer isso.');
      req.usuario = usuario; req.rid = usuario.restaurante; req.rest = rest;
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { assinar, verificar, identificar, exigir };
