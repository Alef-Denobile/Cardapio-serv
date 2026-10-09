/* Página da fatura da mensalidade: mostra o valor e o Pix; confirma sozinha quando o Pix cai */
(function(){
'use strict';
const { $, esc, brl, api, aplicarCor, toast } = C;
const id = decodeURIComponent(location.pathname.split('/').pop()), cod = new URLSearchParams(location.search).get('c') || '';
aplicarCor('#E30613');
let F = null, PIX = null, timer = null;
const data = d => String(d || '').slice(0, 10).split('-').reverse().join('/');

function desenhar(){
  const f = F;
  $('#titulo').textContent = 'Mensalidade de ' + f.mes;
  $('#sub').textContent = f.restaurante + ' · ' + f.plataforma;
  const st = f.status === 'paga' ? '<span class="badge b-good">Paga</span>' : f.status === 'cancelada' ? '<span class="badge b-neu">Cancelada</span>' : f.atrasada ? '<span class="badge b-crit">Vencida</span>' : '<span class="badge b-warn">Em aberto</span>';
  let h = '<div class="card"><div class="row between" style="margin:0"><div><div class="note" style="margin:0">Valor</div><strong style="font-size:30px">' + brl(f.valor) + '</strong></div>' + st + '</div>' +
    '<p style="margin:10px 0 0">Vencimento: <strong>' + data(f.vencimento) + '</strong>' + (f.pagoEm ? ' · paga em ' + new Date(f.pagoEm).toLocaleDateString('pt-BR') : '') + '</p>' +
    (f.suspenso ? '<p class="warnbox">O acesso do restaurante está suspenso por causa desta fatura. Assim que o Pix cair, o cardápio e o painel voltam sozinhos.</p>' : '') + '</div>';
  if (f.status === 'paga') h += '<div class="card"><p class="okbox" style="margin:0">Pagamento confirmado. Obrigado!</p><div class="row"><a class="btn" href="/painel">Abrir o painel</a></div></div>';
  else if (f.status === 'aberta') h += PIX ? Pix.bloco({ id: f.id, total: f.valor, pagamento: { pix: { copiaECola: PIX.qr, expiraEm: PIX.expira, demo: PIX.demo } } }, cod, { demoUrl: '/api/faturas/' + encodeURIComponent(f.id) + '/demo', passo3: 'Pronto: a fatura é baixada sozinha assim que o Pix cair.' })
    : '<div class="card"><button class="btn" id="b-pix">Pagar com Pix</button></div>';
  $('#fatura').innerHTML = h;
  const b = $('#b-pix'); if (b) b.addEventListener('click', gerarPix);
}
async function gerarPix(){
  const b = $('#b-pix'); b.disabled = true; b.textContent = 'Gerando o Pix…';
  try { PIX = (await api('POST', '/api/faturas/' + encodeURIComponent(id) + '/pix', { c: cod })).pix; desenhar(); vigiar(); }
  catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Pagar com Pix'; }
}
function vigiar(){
  clearInterval(timer);
  timer = setInterval(async () => {
    try { const f = (await api('POST', '/api/faturas/' + encodeURIComponent(id) + '/conferir', { c: cod })).fatura; if (f.status !== 'aberta'){ clearInterval(timer); F = f; PIX = null; desenhar(); } } catch (e) {}
  }, 5000);
}
Pix.ligar(f => { clearInterval(timer); F = f; PIX = null; desenhar(); toast('Pagamento confirmado!'); });
(async function(){
  try { history.replaceState(null, '', location.pathname + '?c=' + encodeURIComponent(cod)); } catch (e) {}
  try { F = (await api('GET', '/api/faturas/' + encodeURIComponent(id) + '?c=' + encodeURIComponent(cod))).fatura; desenhar(); }
  catch (e) { $('#titulo').textContent = 'Fatura não encontrada'; $('#sub').textContent = e.message; }
})();
})();
