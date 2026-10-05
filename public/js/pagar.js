/* Tela de pagamento do pedido pago pelo site.
   Modo demonstração: NÃO pede cartão e NÃO cobra nada. Com uma empresa de pagamento real,
   o cliente é levado para a página segura dela, e esta tela só mostra o resultado. */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function toast(t){ const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2800); }
async function api(m, url, corpo){
  let r; try { r = await fetch(url, { method: m, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); }
  catch (e) { throw new Error('Sem conexão. Confira a internet e tente de novo.'); }
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || 'Algo deu errado. Tente de novo.'); return d;
}
const id = decodeURIComponent(location.pathname.split('/').pop()), c = new URLSearchParams(location.search).get('c') || '';
let P = null, cfg = null;

function tela(){
  const app = $('#app');
  if (!P){ app.innerHTML = '<div class="vazio-g"><strong>Pedido não encontrado</strong>O link pode estar incompleto.<div style="margin-top:14px"><a class="btn" href="/">Voltar ao início</a></div></div>'; return; }
  const itens = P.linhas.map(l => '<div class="lin"><span>' + l.qtd + '× ' + esc(l.nome) + '</span><span>' + brl(l.unit * l.qtd) + '</span></div>').join('');
  const resumo = '<div class="itens">' + itens + '</div>' + (P.taxaEntrega ? '<div class="lin"><span>Entrega</span><span>' + brl(P.taxaEntrega) + '</span></div>' : '') + '<div class="lin tot"><span>Total</span><span>' + brl(P.total) + '</span></div>';
  let corpo;
  if (P.status !== 'aguardando'){
    corpo = P.status === 'cancelado'
      ? '<div class="alerta">O prazo para pagar este pedido acabou e ele foi cancelado. Nada foi cobrado.</div><a class="btn" href="/">Fazer o pedido de novo</a>'
      : '<div class="ok-pag">Pagamento aprovado! O restaurante já recebeu o seu pedido.</div><a class="btn" href="/#pedidos">Acompanhar o pedido</a>';
  } else if (cfg && cfg.provedor === 'demo'){
    corpo = (P.pagamento.online === 'recusado' ? '<div class="alerta">O pagamento não foi aprovado. Tente de novo.</div>' : '') +
      '<div class="demo"><strong>Ambiente de demonstração</strong><p>Nenhum cartão é pedido e nada é cobrado. Quando a empresa de pagamento for escolhida, este passo vira a página segura dela (cartão ou Pix).</p></div>' +
      '<div class="row-pag"><button class="pedir" data-r="aprovar">Simular pagamento aprovado</button><button class="btn sec" data-r="recusar">Simular pagamento recusado</button></div>';
  } else corpo = '<div class="alerta">O pagamento pelo site não está disponível agora. Fale com o restaurante.</div>';
  app.innerHTML = '<section class="resumo pag-box" aria-label="Pagamento do pedido"><h2>Pedido #' + P.numero + ' · ' + esc(P.restaurante.nome) + '</h2>' + resumo + corpo + '</section>';
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  b.disabled = true;
  try { const d = await api('POST', '/api/pagamentos/demo/' + encodeURIComponent(id), { c, resultado: b.dataset.r }); P = Object.assign(P, d.pedido); tela();
    if (P.status === 'novo') { toast('Pagamento aprovado'); setTimeout(() => { location.href = '/#pedidos'; }, 1800); } else toast('Pagamento recusado'); }
  catch (err) { toast(err.message); b.disabled = false; }
});
(async function(){
  try {
    const [d, k] = await Promise.all([api('POST', '/api/acompanhar', { pedidos: [{ id, c }] }), api('GET', '/api/pagamentos/config')]);
    P = d.pedidos[0] || null; cfg = k;
  } catch (e) { $('#app').innerHTML = '<div class="vazio-g"><strong>Não foi possível carregar</strong>' + esc(e.message) + '</div>'; return; }
  tela();
})();
})();
