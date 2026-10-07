const jwt = require('jsonwebtoken');
const config = require('../config');
const { sistema } = require('../db');
const { ErroApp } = require('../lib/util');
const { recursosDe } = require('../lib/recursos');

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
    const u = (await c.query('SELECT u.*, r.ativo AS rest_ativo, r.rec_mesa, r.rec_chamados, r.rec_retirada, r.rec_delivery, r.rec_pix, r.rec_cartao, r.rec_dinheiro, r.rec_vitrine, r.rec_online, r.rec_whatsapp, r.rec_totem, r.rec_nfce, r.nome AS rest_nome FROM usuarios u JOIN restaurantes r ON r.id = u.restaurante_id WHERE u.id = $1', [d.sub])).rows[0];
    if (!u || !u.ativo) throw new ErroApp(401, 'Acesso desativado. Fale com o dono do restaurante.');
    if (!u.rest_ativo) throw new ErroApp(403, 'O acesso deste restaurante está suspenso. Fale com o suporte.');
    const usuario = { id: u.id, _id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo, restaurante: u.restaurante_id };
    const rest = { nome: u.rest_nome, ativo: u.rest_ativo, recursos: { mesa: u.rec_mesa, chamados: u.rec_chamados, retirada: u.rec_retirada, delivery: u.rec_delivery, pix: u.rec_pix, cartao: u.rec_cartao, dinheiro: u.rec_dinheiro, vitrine: u.rec_vitrine, online: u.rec_online, whatsapp: u.rec_whatsapp, totem: u.rec_totem, nfce: u.rec_nfce } };
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
