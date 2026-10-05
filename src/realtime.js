// Tempo real: cada restaurante tem uma "sala" para a equipe,
// e cada pedido tem uma sala para o cliente acompanhar.
const { Server } = require('socket.io');
const { identificar } = require('./middleware/auth');
const { sistema } = require('./db');
const { iguais, uuidValido } = require('./lib/util');

let io;

function iniciar(servidorHttp) {
  io = new Server(servidorHttp, { cors: { origin: false }, serveClient: true });
  io.use(async (socket, next) => {
    try {
      const a = socket.handshake.auth || {};
      if (a.token) {
        const { usuario } = await identificar(String(a.token));
        socket.data.equipe = { rid: String(usuario.restaurante), papel: usuario.papel, id: String(usuario.id) };
        return next();
      }
      if (a.cliente) {
        const d = require('./middleware/auth').verificar(String(a.cliente));
        if (d.tipo !== 'cliente') return next(new Error('nao-autorizado'));
        socket.data.cliente = String(d.sub);
        return next();
      }
      // Acompanhamento sem conta: um pedido ({pedido, codigo}) ou vários ({pedidos: [{id, c}]}) guardados no aparelho
      const lista = Array.isArray(a.pedidos) ? a.pedidos.slice(0, 20) : (a.pedido && a.codigo ? [{ id: a.pedido, c: a.codigo }] : []);
      const validos = lista.filter(x => x && uuidValido(String(x.id)) && x.c).map(x => ({ id: String(x.id), c: String(x.c) }));
      if (validos.length) {
        const rows = await sistema(async c => (await c.query('SELECT id, codigo_acomp FROM pedidos WHERE id = ANY($1)', [validos.map(x => x.id)])).rows);
        const ok = rows.filter(r => validos.some(x => x.id === r.id && iguais(r.codigo_acomp, x.c))).map(r => String(r.id));
        if (!ok.length) return next(new Error('nao-autorizado'));
        socket.data.pedidos = ok;
        return next();
      }
      next(new Error('nao-autorizado'));
    } catch (e) { next(new Error('nao-autorizado')); }
  });
  io.on('connection', socket => {
    if (socket.data.equipe) socket.join('rest:' + socket.data.equipe.rid);
    (socket.data.pedidos || []).forEach(id => socket.join('pedido:' + id));
    if (socket.data.cliente) socket.join('cliente:' + socket.data.cliente);
  });
  return io;
}

function paraEquipe(rid, evento, dados) { if (io) io.to('rest:' + String(rid)).emit(evento, dados); }
// Avisa quem acompanha o pedido pelo link e, se o pedido tem conta de cliente, todas as telas dessa conta
function paraCliente(pedidoId, evento, dados, clienteId) { if (!io) return; let alvo = io.to('pedido:' + String(pedidoId)); if (clienteId) alvo = alvo.to('cliente:' + String(clienteId)); alvo.emit(evento, dados); }

module.exports = { iniciar, paraEquipe, paraCliente };
