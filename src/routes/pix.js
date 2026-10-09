// Pix automático: cria a cobrança, recebe o aviso do Mercado Pago e confere os pendentes.
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sistema } = require('../db');
const repo = require('../lib/repo');
const pix = require('../lib/pix');
const { ErroApp, rota, texto, iguais, uuidValido, urlBase, pedidoParaCliente } = require('../lib/util');
const { aprovar } = require('./pagamentos');
const rt = require('../realtime');
const whatsapp = require('../lib/whatsapp');

const r = express.Router();
const limite = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas requisições.' } });
const tokenDo = rid => sistema(async c => ((await c.query('SELECT pix_token FROM restaurantes WHERE id = $1', [rid])).rows[0] || {}).pix_token || '');

// Chamado logo depois de criar um pedido com Pix automático. Se o Mercado Pago falhar, o pedido vira Pix manual
// (vai para a cozinha e o cliente paga pela chave Pix), para nunca perder a venda.
async function iniciarCobranca(req, rest, pedido) {
  try {
    const token = rest.pixAuto.provedor === 'demo' ? '' : await tokenDo(rest.id);
    const cob = await pix.cobrar(rest, token, { id: pedido.id, numero: pedido.numero, total: pedido.total, descricao: 'Pedido #' + String(pedido.numero).padStart(3, '0') + ' · ' + rest.nome, base: urlBase(req) });
    const out = await sistema(async c => {
      const row = (await c.query('UPDATE pedidos SET pag_ref = $2, pix_qr = $3, pix_expira = $4 WHERE id = $1 RETURNING *', [pedido.id, cob.ref, cob.qr, cob.expira])).rows[0];
      return (await repo.completarPedidos(c, [row]))[0];
    });
    return { ok: true, pedido: out };
  } catch (e) {
    console.error('Pix automático falhou (' + rest.slug + '): ' + e.message + '. O pedido segue com Pix manual.');
    const out = await sistema(async c => {
      const row = (await c.query("UPDATE pedidos SET status = 'novo', pag_status = NULL WHERE id = $1 AND status = 'aguardando' RETURNING *", [pedido.id])).rows[0];
      if (!row) return null;
      await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1,$2,$3,$4)', [row.id, row.restaurante_id, 'novo', 'Pix automático indisponível: pagar pela chave']);
      return (await repo.completarPedidos(c, [row]))[0];
    });
    if (out) { rt.paraEquipe(rest.id, 'pedido:novo', out); whatsapp.avisar(rest, out); }
    return { ok: false, pedido: out || pedido };
  }
}

// Confere no Mercado Pago e aprova se estiver pago (valor e pedido conferidos)
async function conferir(row, token) {
  if (!row.pag_ref || /^demo-/.test(row.pag_ref) || !token) return false;
  const st = await pix.consultar(token, row.pag_ref);
  if (!st.pago) return false;
  if (st.referencia !== row.id || Math.abs(st.valor - Number(row.total)) > 0.009) { console.error('Pix com dados que não batem no pedido ' + row.id + ' (ref ' + row.pag_ref + ').'); return false; }
  if (row.status === 'aguardando') { await aprovar(row.id, row.pag_ref); return true; }
  // pago depois do prazo (pedido já cancelado): registra para o restaurante devolver o dinheiro
  await sistema(async c => {
    const u = (await c.query("UPDATE pedidos SET pag_pago = true, pag_status = 'aprovado' WHERE id = $1 AND status = 'cancelado' AND NOT pag_pago RETURNING restaurante_id, numero", [row.id])).rows[0];
    if (u) { await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1,$2,$3,$4)', [row.id, u.restaurante_id, 'cancelado', 'Pix pago depois do prazo: devolver ao cliente']);
      rt.paraEquipe(u.restaurante_id, 'pix:tarde', { numero: u.numero, total: Number(row.total) }); }
  });
  return true;
}

// Aviso do Mercado Pago. O endereço leva uma chave secreta do restaurante; mesmo assim, nada é aprovado
// sem consultar o pagamento no Mercado Pago com o token do restaurante.
r.post('/webhook/:chave', limite, rota(async (req, res) => {
  const chave = texto(req.params.chave, 60);
  const rest = await sistema(async c => (await c.query('SELECT id, pix_token, pix_segredo FROM restaurantes WHERE pix_chave_webhook = $1', [chave])).rows[0]);
  if (!rest) return res.status(404).json({ erro: 'Endereço não encontrado.' });
  const b = req.body || {}, dataId = String(req.query['data.id'] || (b.data && b.data.id) || req.query.id || '').slice(0, 40);
  const tipo = String(req.query.type || b.type || req.query.topic || b.topic || '');
  if (!pix.assinaturaValida(rest.pix_segredo, req.get('x-signature'), req.get('x-request-id'), dataId)) return res.status(401).json({ erro: 'Assinatura inválida.' });
  res.status(200).json({ ok: true }); // responde logo; a conferência é feita em seguida
  if (!dataId || (tipo && !/payment/.test(tipo))) return;
  try {
    const row = await sistema(async c => (await c.query("SELECT * FROM pedidos WHERE restaurante_id = $1 AND pag_ref = $2 AND pag_metodo = 'pix'", [rest.id, dataId])).rows[0]);
    if (row) await conferir(row, rest.pix_token);
  } catch (e) { console.error('Webhook do Pix:', e.message); }
}));

// Só no modo de demonstração: o botão "Simular pagamento" da tela do cliente
r.post('/demo/:id', rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), rota(async (req, res) => {
  if (!config.pixDemo || !uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const row = await sistema(async c => (await c.query('SELECT id, status, codigo_acomp, pag_ref FROM pedidos WHERE id = $1', [req.params.id])).rows[0]);
  if (!row || !iguais(row.codigo_acomp, texto(req.body && req.body.c, 40)) || !/^demo-/.test(row.pag_ref || '')) throw new ErroApp(404, 'Pedido não encontrado.');
  if (row.status !== 'aguardando') throw new ErroApp(409, row.status === 'cancelado' ? 'O prazo para pagar acabou.' : 'Este pedido já foi pago.');
  const out = await aprovar(row.id, row.pag_ref);
  res.json({ pedido: out ? pedidoParaCliente(out.obj) : null });
}));

// A cada 20 s confere os Pix pendentes no Mercado Pago (se o aviso não chegar, o pedido entra mesmo assim)
let rodando = false;
async function conferirPendentes() {
  if (rodando) return; rodando = true;
  try {
    const rows = await sistema(async c => (await c.query(`SELECT p.*, r.pix_token FROM pedidos p JOIN restaurantes r ON r.id = p.restaurante_id
      WHERE p.status = 'aguardando' AND p.pag_metodo = 'pix' AND p.pag_ref IS NOT NULL AND p.pag_ref NOT LIKE 'demo-%' AND p.criado_em > now() - interval '40 minutes' ORDER BY p.criado_em LIMIT 50`)).rows);
    for (const row of rows) { try { await conferir(row, row.pix_token); } catch (e) { if (e.status !== 404) console.error('Conferência do Pix:', e.message); } }
  } catch (e) { console.error('Conferência do Pix:', e.message); }
  rodando = false;
}
function iniciarConferencia() { return setInterval(conferirPendentes, 20000).unref(); }

module.exports = { router: r, iniciarCobranca, conferir, conferirPendentes, iniciarConferencia, tokenDo };
