// Pagamento pelo site: confirmação (demo hoje; webhook da empresa de pagamento no futuro)
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sistema } = require('../db');
const repo = require('../lib/repo');
const pagamentos = require('../lib/pagamentos');
const { ErroApp, rota, texto, iguais, uuidValido, pedidoParaCliente } = require('../lib/util');
const rt = require('../realtime');

const r = express.Router();
const limite = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas. Aguarde alguns minutos.' } });

r.get('/config', (req, res) => { const p = pagamentos.provedor(); res.json({ ativo: pagamentos.ativo(), provedor: p ? config.pagamentoProvedor : null, nome: p ? p.nome : null }); });

// Marca o pagamento como aprovado e libera o pedido para a cozinha. Usado pela demo e, no futuro, pelo webhook.
async function aprovar(id, ref) {
  const out = await sistema(async c => {
    const row = (await c.query("UPDATE pedidos SET status = 'novo', pag_pago = true, pag_status = 'aprovado', pag_ref = coalesce($2, pag_ref) WHERE id = $1 AND status = 'aguardando' RETURNING *", [id, ref || null])).rows[0];
    if (!row) return null;
    await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1,$2,$3,$4)', [row.id, row.restaurante_id, 'novo', 'pagamento aprovado']);
    return { row, obj: (await repo.completarPedidos(c, [row]))[0] };
  });
  if (out) { rt.paraEquipe(out.row.restaurante_id, 'pedido:novo', out.obj); rt.paraCliente(out.row.id, 'pedido:atualizado', pedidoParaCliente(out.obj), out.row.cliente_id); }
  return out;
}
async function recusar(id) {
  const out = await sistema(async c => {
    const row = (await c.query("UPDATE pedidos SET pag_status = 'recusado' WHERE id = $1 AND status = 'aguardando' RETURNING *", [id])).rows[0];
    return row ? { row, obj: (await repo.completarPedidos(c, [row]))[0] } : null;
  });
  if (out) rt.paraCliente(out.row.id, 'pedido:atualizado', pedidoParaCliente(out.obj), out.row.cliente_id);
  return out;
}

// Só existe no modo de demonstração: simula a resposta da empresa de pagamento
r.post('/demo/:id', limite, rota(async (req, res) => {
  if (config.pagamentoProvedor !== 'demo') throw new ErroApp(404, 'Endereço não encontrado.');
  if (!uuidValido(req.params.id)) throw new ErroApp(404, 'Pedido não encontrado.');
  const b = req.body || {};
  const row = await sistema(async c => (await c.query('SELECT id, status, codigo_acomp FROM pedidos WHERE id = $1', [req.params.id])).rows[0]);
  if (!row || !iguais(row.codigo_acomp, texto(b.c, 40))) throw new ErroApp(404, 'Pedido não encontrado.');
  if (row.status !== 'aguardando') throw new ErroApp(409, row.status === 'cancelado' ? 'O prazo para pagar este pedido acabou. Faça o pedido de novo.' : 'Este pedido já foi pago.');
  const out = b.resultado === 'recusar' ? await recusar(row.id) : await aprovar(row.id);
  res.json({ pedido: out ? pedidoParaCliente(out.obj) : null });
}));

// Pedido pago pelo site que não foi pago em 30 minutos é cancelado (não chegou a ir para a cozinha)
async function cancelarVencidos() {
  try {
    const n = await sistema(async c => {
      const rows = (await c.query("UPDATE pedidos SET status = 'cancelado' WHERE status = 'aguardando' AND criado_em < now() - interval '30 minutes' RETURNING id, restaurante_id")).rows;
      for (const x of rows) await c.query('INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por) VALUES ($1,$2,$3,$4)', [x.id, x.restaurante_id, 'cancelado', 'pagamento não concluído']);
      return rows.length;
    });
    if (n) console.log(`Cancelados ${n} pedido(s) sem pagamento.`);
  } catch (e) { console.error('Erro ao cancelar pedidos sem pagamento:', e.message); }
}
function iniciarLimpeza() { cancelarVencidos(); return setInterval(cancelarVencidos, 5 * 60 * 1000).unref(); }

module.exports = { router: r, aprovar, recusar, iniciarLimpeza };
