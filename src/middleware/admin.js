// Login da equipe de devs. O token é diferente do token dos restaurantes
// e não abre o painel de nenhum restaurante, nem o contrário.
const jwt = require('jsonwebtoken');
const config = require('../config');
const { sistema } = require('../db');
const { ErroApp } = require('../lib/util');

function assinarAdmin(a) { return jwt.sign({ sub: String(a.id), tipo: 'admin' }, config.jwtSecret, { expiresIn: '8h' }); }

async function exigirAdmin(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new ErroApp(401, 'Entre com sua conta de desenvolvedor.');
    let d; try { d = jwt.verify(token, config.jwtSecret); } catch (e) { throw new ErroApp(401, 'Sua sessão expirou. Entre de novo.'); }
    if (d.tipo !== 'admin') throw new ErroApp(401, 'Entre com sua conta de desenvolvedor.');
    const a = await sistema(async c => (await c.query('SELECT id, nome, email, ativo FROM admins WHERE id = $1', [d.sub])).rows[0]);
    if (!a || !a.ativo) throw new ErroApp(401, 'Conta de desenvolvedor desativada.');
    req.admin = a;
    next();
  } catch (e) { next(e); }
}

module.exports = { assinarAdmin, exigirAdmin };
