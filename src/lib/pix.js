// Pix com confirmação automática.
// Cada restaurante liga a PRÓPRIA conta do Mercado Pago (o dinheiro cai direto na conta dele).
// O servidor cria a cobrança Pix, mostra o QR / copia e cola para o cliente e marca o pedido como pago sozinho:
//   1) pelo aviso do Mercado Pago (webhook), e
//   2) por uma conferência a cada 20 segundos (se o aviso falhar).
// Provedor "demo": gera um Pix de mentira e um botão "Simular pagamento", para apresentações.
const crypto = require('crypto');
const config = require('../config');
const { recursosDe } = require('./recursos');

const MP = (process.env.MERCADOPAGO_API_URL || 'https://api.mercadopago.com').replace(/\/+$/, ''); // trocar só em testes
const PRAZO_MIN = 30; // tempo para pagar; depois disso o pedido é cancelado sozinho

/* ---------- Mercado Pago ---------- */
async function mp(token, metodo, caminho, corpo, idem) {
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  if (idem) h['X-Idempotency-Key'] = idem;
  let r;
  try { r = await fetch(MP + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(12000) }); }
  catch (e) { throw new Error('Sem resposta do Mercado Pago (' + e.message + ').'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.message || d.error || ('erro ' + r.status);
    throw Object.assign(new Error(r.status === 401 ? 'Token do Mercado Pago inválido ou sem permissão.' : 'Mercado Pago: ' + msg), { status: r.status });
  }
  return d;
}
// data no formato que o Mercado Pago pede: 2026-10-09T12:30:00.000-03:00
function dataMp(d) {
  const off = -d.getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off);
  const p = n => String(n).padStart(2, '0');
  const l = new Date(d.getTime() + off * 60000);
  return l.toISOString().replace('Z', '').replace(/\.\d+$/, '.000') + s + p(Math.floor(a / 60)) + ':' + p(a % 60);
}
function emailPagador() {
  let host = 'cardapio.app';
  try { if (config.urlPublica) host = new URL(config.urlPublica).hostname; } catch (e) {}
  return 'pagador@' + (host.includes('.') ? host : 'cardapio.app');
}

/* ---------- Pix de demonstração (formato de BR Code, mas sem valor) ---------- */
function crc16(s) {
  let c = 0xFFFF;
  for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
function brCodeDemo(nome, valor, ref) {
  const limpo = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase();
  const corpo = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', 'demonstracao-sem-valor')) + campo('52', '0000') + campo('53', '986') +
    campo('54', valor.toFixed(2)) + campo('58', 'BR') + campo('59', limpo(nome).slice(0, 25) || 'RESTAURANTE') + campo('60', 'DEMO') + campo('62', campo('05', limpo(ref).replace(/ /g, '').slice(0, 25))) + '6304';
  return corpo + crc16(corpo);
}

/* ---------- uso pelo sistema ---------- */
// O restaurante usa Pix automático? (função liberada pelos devs + Pix ligado + conta configurada pelo dono)
function ativo(rest) {
  const rc = recursosDe(rest), pa = rest.pixAuto || {};
  if (!rc.pixauto || !rc.pix || !pa.ativo) return false;
  if (pa.provedor === 'demo') return config.pixDemo;
  return pa.provedor === 'mercadopago' && pa.tokenConfigurado;
}
const webhookUrl = (rest, base) => base && /^https:\/\//.test(base) && rest.pixAuto.chaveWebhook ? base + '/api/pix/webhook/' + rest.pixAuto.chaveWebhook : '';

// Cria a cobrança. token: o token do Mercado Pago do restaurante (lido do banco só aqui)
async function cobrar(rest, token, { id, numero, total, descricao, base }) {
  const expira = new Date(Date.now() + PRAZO_MIN * 60000 + 30000);
  if (rest.pixAuto.provedor === 'demo') {
    return { ref: 'demo-' + id.slice(0, 8), qr: brCodeDemo(rest.nome, total, 'PED' + String(numero).padStart(3, '0')), expira, demo: true };
  }
  const corpo = { transaction_amount: Math.round(total * 100) / 100, payment_method_id: 'pix', description: String(descricao).slice(0, 200), external_reference: id,
    payer: { email: emailPagador() }, date_of_expiration: dataMp(expira) };
  const wh = webhookUrl(rest, base); if (wh) corpo.notification_url = wh;
  const d = await mp(token, 'POST', '/v1/payments', corpo, 'pix-' + id);
  const td = (d.point_of_interaction && d.point_of_interaction.transaction_data) || {};
  if (!td.qr_code) throw new Error('O Mercado Pago não devolveu o código Pix. Confira se a conta tem chave Pix cadastrada.');
  return { ref: String(d.id), qr: td.qr_code, expira, demo: false };
}

// Consulta uma cobrança no Mercado Pago: { pago, status, referencia, valor }
async function consultar(token, ref) {
  const d = await mp(token, 'GET', '/v1/payments/' + encodeURIComponent(ref));
  return { pago: d.status === 'approved', status: d.status, referencia: d.external_reference, valor: +d.transaction_amount };
}
// Testa o token do dono (mostra de qual conta é)
async function testar(token) {
  const d = await mp(token, 'GET', '/users/me');
  return { conta: d.nickname || d.first_name || '', email: d.email || '', id: d.id };
}

// Assinatura do aviso do Mercado Pago (cabeçalho x-signature: "ts=...,v1=...")
function assinaturaValida(segredo, cabecalho, requestId, dataId) {
  if (!segredo) return true; // sem segredo cadastrado, a segurança vem da consulta ao Mercado Pago com o token
  const partes = Object.fromEntries(String(cabecalho || '').split(',').map(x => x.trim().split('=')).filter(x => x.length === 2));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(dataId || '')) ? String(dataId).toLowerCase() : String(dataId || '');
  const manifesto = (id ? 'id:' + id + ';' : '') + (requestId ? 'request-id:' + requestId + ';' : '') + 'ts:' + partes.ts + ';';
  const h = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(partes.v1))); } catch (e) { return false; }
}

module.exports = { ativo, cobrar, consultar, testar, assinaturaValida, webhookUrl, brCodeDemo, mp, dataMp, PRAZO_MIN };
