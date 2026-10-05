// Avisos automáticos para o cliente pelo WhatsApp.
// Provedores: "" (desligado), "log" (só escreve no log do servidor, para testar) e "meta" (API oficial do WhatsApp, a Cloud API da Meta).
// Mensagem iniciada pela empresa precisa de um MODELO aprovado pela Meta (veja o README). Cada mensagem tem custo.
const config = require('../config');
const { recursosDe } = require('./recursos');

// Só os momentos que importam para o cliente (menos mensagens = menos custo)
function textoStatus(p) {
  if (p.status === 'novo') return 'recebemos seu pedido e já vamos preparar';
  if (p.status === 'pronto' && p.tipo === 'retirada') return 'seu pedido está pronto para retirar';
  if (p.status === 'rota') return 'seu pedido saiu para entrega' + (p.entregador && p.entregador.nome ? ' com ' + p.entregador.nome : '');
  if (p.status === 'cancelado') return 'seu pedido foi cancelado. Se tiver dúvida, fale com o restaurante';
  return null;
}
function numeroWhats(tel) {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.length < 10) return null;
  if (n.length <= 11) n = '55' + n; // número brasileiro sem o código do país
  return n;
}

async function enviarMeta(para, params) {
  const url = `https://graph.facebook.com/${config.whatsapp.versao}/${config.whatsapp.phoneId}/messages`;
  const corpo = { messaging_product: 'whatsapp', to: para, type: 'template',
    template: { name: config.whatsapp.modelo, language: { code: config.whatsapp.idioma }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 200) })) }] } };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + config.whatsapp.token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('WhatsApp respondeu ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

// Nunca trava o pedido: se o envio falhar, só registra no log
async function avisar(rest, p) {
  try {
    const prov = config.whatsapp.provedor;
    if (!prov || !rest || !recursosDe(rest).whatsapp || p.tipo === 'mesa') return false;
    const st = textoStatus(p), para = numeroWhats(p.cliente && p.cliente.tel);
    if (!st || !para) return false;
    const nome = String((p.cliente && p.cliente.nome) || 'cliente').split(' ')[0];
    const params = [nome, String(p.numero), rest.nome, st]; // "Olá, {{1}}! Pedido #{{2}} no {{3}}: {{4}}."
    if (prov === 'log') console.log(`[WhatsApp] para ${para.slice(0, 4)}…${para.slice(-2)}: Olá, ${params[0]}! Pedido #${params[1]} no ${params[2]}: ${params[3]}.`);
    else if (prov === 'meta') await enviarMeta(para, params);
    return true;
  } catch (e) { console.error('Aviso por WhatsApp não enviado:', e.message); return false; }
}

module.exports = { avisar, textoStatus, numeroWhats };
