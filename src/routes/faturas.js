// Página pública da fatura da mensalidade (/fatura/:id?c=código) e aviso do Mercado Pago da plataforma.
// Funciona sem login, porque o dono precisa conseguir pagar mesmo com o painel suspenso.
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sistema } = require('../db');
const cobranca = require('../lib/cobranca');
const pix = require('../lib/pix');
const { ErroApp, rota, texto, iguais, uuidValido } = require('../lib/util');

const r = express.Router();
const limite = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { erro: 'Muitas tentativas. Aguarde alguns minutos.' } });

async function faturaDoLink(id, codigo) {
  if (!uuidValido(id)) throw new ErroApp(404, 'Fatura não encontrada.');
  const f = await sistema(async c => (await c.query(cobranca.SELECT_F.replace('FROM faturas f', ', r.nome AS rest_nome, r.ativo AS rest_ativo, r.suspenso_cobranca FROM faturas f') + ' WHERE f.id = $1', [id])).rows[0]);
  if (!f || !iguais(f.codigo, texto(codigo, 60))) throw new ErroApp(404, 'Fatura não encontrada. Confira o link do e-mail.');
  return f;
}
const publica = f => Object.assign(cobranca.faturaObj(f), { codigo: undefined, restaurante: f.rest_nome, suspenso: !f.rest_ativo && f.suspenso_cobranca, plataforma: config.plataforma.nome });

r.get('/:id', limite, rota(async (req, res) => { res.json({ fatura: publica(await faturaDoLink(req.params.id, req.query.c)) }); }));

r.post('/:id/pix', limite, rota(async (req, res) => {
  const f = await faturaDoLink(req.params.id, req.body && req.body.c);
  if (f.status !== 'aberta') throw new ErroApp(409, f.status === 'paga' ? 'Esta fatura já está paga.' : 'Esta fatura foi cancelada.');
  res.json({ pix: await cobranca.pixDaFatura(f, f.rest_nome) });
}));

// Confere se o Pix já caiu (a página pergunta a cada poucos segundos)
r.post('/:id/conferir', limite, rota(async (req, res) => {
  let f = await faturaDoLink(req.params.id, req.body && req.body.c);
  if (f.status === 'aberta') { try { if (await cobranca.conferirFatura(f)) f = await faturaDoLink(req.params.id, req.body.c); } catch (e) {} }
  res.json({ fatura: publica(f) });
}));

// Só no modo de demonstração
r.post('/:id/demo', limite, rota(async (req, res) => {
  if (config.cobranca.provedor !== 'demo') throw new ErroApp(404, 'Endereço não encontrado.'); // só existe com COBRANCA_PROVEDOR=demo
  const f = await faturaDoLink(req.params.id, req.body && req.body.c);
  if (f.status !== 'aberta') throw new ErroApp(409, 'Esta fatura não está em aberto.');
  await cobranca.darBaixa(f.id, 'pix');
  res.json({ fatura: publica(await faturaDoLink(req.params.id, req.body.c)) });
}));

// Aviso do Mercado Pago da plataforma (cadastre https://SEU-SITE/api/faturas/webhook em Webhooks > Pagamentos)
r.post('/webhook', limite, rota(async (req, res) => {
  const b = req.body || {}, dataId = String(req.query['data.id'] || (b.data && b.data.id) || '').slice(0, 40);
  if (!pix.assinaturaValida(config.cobranca.mpSegredo, req.get('x-signature'), req.get('x-request-id'), dataId)) return res.status(401).json({ erro: 'Assinatura inválida.' });
  res.json({ ok: true });
  if (!dataId) return;
  try { const f = await sistema(async c => (await c.query("SELECT * FROM faturas WHERE pix_ref = $1 AND status = 'aberta'", [dataId])).rows[0]); if (f) await cobranca.conferirFatura(f); }
  catch (e) { console.error('Webhook da mensalidade:', e.message); }
}));

module.exports = r;
