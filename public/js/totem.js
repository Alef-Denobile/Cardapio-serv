/* Modo totem: autoatendimento no balcão (tablet ou totem com tela de toque).
   Abre pelo link do painel (/r/<restaurante>/totem?t=<código>). Pedido para comer aqui ou levar,
   pago no caixa ou por Pix. Volta sozinho para o início depois de cada pedido ou se ficar parado. */
(function(){
'use strict';
const N = n => String(n == null ? '' : n).padStart(3, '0'); // número do pedido do dia: 001, 002…
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SLUG = (/^\/r\/([a-z0-9-]+)\/totem/.exec(location.pathname) || [])[1] || (document.querySelector('meta[name="restaurante"]') || {}).content || '';
const QS = new URLSearchParams(location.search), TOKEN = QS.get('t') || '', IMPRIMIR = QS.get('imprimir') === '1';
const ICO_P = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="26" r="13"/><circle cx="24" cy="26" r="7"/><path d="M6 10v28M3.5 10v7a2.5 2.5 0 0 0 5 0v-7M44 10c-3 0-4 4-4 9h4v19"/></svg>', ICO_S = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><path d="M9 16h30l-2.5 26h-25z"/><path d="M17 16a7 7 0 0 1 14 0"/></svg>';
const PARADO_MS = 75000, AVISO_S = 15, FIM_S = 25;

let R = null, P = [];
const S = { tela: 'inicio', consumo: 'local', cat: null, cart: [], nome: '', pag: 'local', item: null, enviando: false, ultimo: null, toque: Date.now(), aviso: null, fimT: null };

async function api(m, url, corpo){
  let r; try { r = await fetch(url, { method: m, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); }
  catch (e) { throw new Error('Sem conexão. Chame um atendente.'); }
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.erro || 'Algo deu errado. Tente de novo.'), { status: r.status }); return d;
}
function toast(t){ const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3200); }
const prod = id => P.find(p => p.id === id);
const unit = (p, sel) => Opcoes.unit(p, sel || {});
const nomesSel = (p, sel) => Opcoes.nomes(p, sel || {});
const total = () => S.cart.reduce((a, l) => a + unit(prod(l.id), l.sel) * l.q, 0);
const qtd = id => S.cart.filter(l => id == null || l.id === id).reduce((a, l) => a + l.q, 0);
const cats = () => (R.categorias || []).filter(c => P.some(p => p.categoria === c));
const foto = (p, cls) => p.fotoUrl ? '<img class="' + cls + '" src="' + esc(p.fotoUrl) + '" alt="" loading="lazy">' : '<div class="' + cls + ' ph" aria-hidden="true">' + esc(p.nome[0]) + '</div>';
const aberto = () => R.aberto || R.aceitarForaDoHorario;
const pagamentos = () => (R.pagamentos.retirada || []).filter(m => m === 'local' || m === 'pix');

/* ---------- telas ---------- */
function telaInicio(){
  return '<section class="tt-inicio"' + (R.capaUrl ? ' style="--capa:url(\'' + esc(R.capaUrl) + '\')"' : '') + '><div class="tt-veu"></div><div class="tt-ini-box">' +
    (R.logoUrl ? '<img class="tt-logo" src="' + esc(R.logoUrl) + '" alt="">' : '<div class="tt-logo mono" aria-hidden="true">' + esc(R.nome.split(/\s+/).map(w => w[0]).join('').slice(0, 2)) + '</div>') +
    '<h1>' + esc(R.nome) + '</h1>' + (R.frase ? '<p>' + esc(R.frase) + '</p>' : '') +
    (aberto() ? '<div class="tt-ini-bts"><button class="tt-big" data-comecar="local">'+ICO_P+'Comer aqui</button><button class="tt-big" data-comecar="viagem">'+ICO_S+'Para levar</button></div><p class="tt-dica">Toque para começar o seu pedido</p>'
      : '<p class="tt-fechado">Estamos fechados agora. Abrimos às ' + esc(R.abre) + '.</p>') + '</div></section>';
}
function cardProd(p){
  const n = qtd(p.id), extra = Opcoes.variavel(p);
  return '<article class="tt-item' + (p.esgotado ? ' off' : '') + '"><button class="tt-ver" data-ver="' + p.id + '"' + (p.esgotado ? ' disabled' : '') + '>' + foto(p, 'tt-foto') +
    '<span class="tt-txt"><strong>' + esc(p.nome) + '</strong><small>' + esc(p.descricao) + '</small>' +
    ((p.selos || []).length ? '<span class="tt-selos">' + p.selos.map(x => '<i>' + esc(x) + '</i>').join('') + '</span>' : '') + '</span></button>' +
    '<div class="tt-lado"><b>' + (extra ? '<em>a partir de</em>' : '') + brl(Opcoes.aPartir(p)) + '</b>' +
    (p.esgotado ? '<span class="tt-esg">' + (p.foraHorario ? 'Só ' + esc(p.foraHorario) : 'Esgotado') + '</span>' : '<button class="tt-add" data-ver="' + p.id + '" aria-label="Adicionar ' + esc(p.nome) + '"><span aria-hidden="true">+</span> Adicionar' + (n ? '<span class="tt-n" aria-label="' + n + ' no pedido">' + n + '</span>' : '') + '</button>') + '</div></article>';
}
function topo(titulo){
  const logo = R.logoUrl ? '<img class="tt-mlogo" src="' + esc(R.logoUrl) + '" alt="">' : '<span class="tt-mlogo mono" aria-hidden="true">' + esc(R.nome.split(/\s+/).map(w => w[0]).join('').slice(0, 2)) + '</span>';
  return '<header class="tt-topo"><div class="tt-marca">' + logo + '<div><strong>' + esc(R.nome) + '</strong><span>Autoatendimento · ' + (S.consumo === 'viagem' ? 'Para levar' : 'Comer aqui') + '</span></div></div>' +
    (titulo ? '<h2>' + titulo + '</h2>' : '') + '<button class="tt-bt" data-act="recomecar">Recomeçar</button></header>';
}
function barra(){
  const n = qtd();
  return '<footer class="tt-barra"><div><strong>' + (n ? n + (n > 1 ? ' itens no pedido' : ' item no pedido') : 'Seu pedido está vazio') + '</strong><span>' + brl(total()) + '</span></div>' +
    '<button class="tt-pri" data-ir="carrinho"' + (n ? '' : ' disabled') + '>Ver pedido e finalizar</button></footer>';
}
function telaCardapio(){
  const cs = cats(); if (!S.cat || !cs.includes(S.cat)) S.cat = cs[0];
  return topo() + '<div class="tt-corpo"><nav class="tt-cats" aria-label="Categorias">' + cs.map(c => { const p = P.find(x => x.categoria === c && x.fotoUrl) || P.find(x => x.categoria === c);
      return '<button data-cat="' + esc(c) + '" aria-pressed="' + (S.cat === c) + '">' + foto(p, 'tt-ci') + '<span>' + esc(c) + '</span></button>'; }).join('') + '</nav>' +
    '<section class="tt-lista"><h2>' + esc(S.cat) + ' <small>' + (l => l + (l === 1 ? ' item' : ' itens'))(P.filter(p => p.categoria === S.cat).length) + '</small></h2><div class="tt-grid">' + P.filter(p => p.categoria === S.cat).map(cardProd).join('') + '</div></section></div>' + barra();
}
function telaCarrinho(){
  const sug = Sugestoes.escolher(P, S.cart.map(l => l.id), 4);
  return topo('Seu pedido') + '<div class="tt-pagina"><div class="tt-linhas">' + S.cart.map((l, i) => { const p = prod(l.id), ns = nomesSel(p, l.sel);
      return '<div class="tt-linha">' + foto(p, 'tt-th') + '<div><strong>' + esc(p.nome) + '</strong>' + (ns.length ? '<small>' + esc(ns.join(' · ')) + '</small>' : '') + '<b>' + brl(unit(p, l.sel) * l.q) + '</b></div>' +
        '<div class="tt-step"><button data-linha="' + i + '" data-d="-1" aria-label="Tirar um">−</button><span>' + l.q + '</span><button data-linha="' + i + '" data-d="1" aria-label="Mais um">+</button></div></div>'; }).join('') + '</div>' +
    (sug.length ? '<section class="tt-peca"><h3>Peça também</h3><div class="tt-grid peq">' + sug.map(cardProd).join('') + '</div></section>' : '') +
    '<div class="tt-acoes"><button class="tt-sec" data-ir="cardapio">Adicionar mais itens</button><button class="tt-pri" data-ir="dados"' + (S.cart.length ? '' : ' disabled') + '>Continuar · ' + brl(total()) + '</button></div></div>';
}
function telaDados(){
  const pags = pagamentos(); if (!pags.includes(S.pag)) S.pag = pags[0];
  return topo('Quase lá') + '<div class="tt-pagina estreita">' +
    '<label class="tt-l" for="tt-nome">Como podemos chamar você?</label><input id="tt-nome" class="tt-in" maxlength="40" autocomplete="off" placeholder="Seu nome" value="' + esc(S.nome) + '">' +
    '<p class="tt-l">Onde vai comer?</p><div class="tt-seg"><button data-consumo="local" aria-pressed="' + (S.consumo === 'local') + '">Comer aqui</button><button data-consumo="viagem" aria-pressed="' + (S.consumo === 'viagem') + '">Para levar</button></div>' +
    '<p class="tt-l">Como vai pagar?</p><div class="tt-seg">' + pags.map(m => '<button data-pag="' + m + '" aria-pressed="' + (S.pag === m) + '">' + (m === 'pix' ? (R.pixAuto ? 'Pix (pague aqui pelo QR)' : 'Pix') : 'No caixa (cartão ou dinheiro)') + '</button>').join('') + '</div>' +
    '<div class="tt-total"><span>Total</span><strong>' + brl(total()) + '</strong></div>' +
    '<div class="tt-acoes"><button class="tt-sec" data-ir="carrinho">Voltar</button><button class="tt-pri" data-act="finalizar"' + (S.enviando ? ' disabled' : '') + '>' + (S.enviando ? 'Enviando…' : 'Finalizar pedido') + '</button></div>' +
    '<p class="tt-legal">Ao finalizar, você concorda com os Termos de uso e o Aviso de privacidade do restaurante. Usamos o seu nome só para chamar você quando o pedido ficar pronto. Leia em ' + esc(location.host) + '/privacidade</p></div>';
}
function telaFim(){
  const p = S.ultimo, pix = p.pagamento.metodo === 'pix' && !p.pagamento.pago, pago = p.pagamento.pago;
  return '<section class="tt-fim"><p class="tt-ok">Pedido recebido!</p><p>Sua senha é</p><div class="tt-senha">' + N(p.numero) + '</div>' +
    '<p class="tt-fim-msg">' + esc((p.cliente && p.cliente.nome) || '') + ', ' + (pago ? 'seu Pix de ' + brl(p.total) + ' foi confirmado.' : pix ? 'pague ' + brl(p.total) + ' com Pix' + (R.chavePix ? ' na chave <strong>' + esc(R.chavePix) + '</strong>' : '') + ' e mostre o comprovante no balcão.' : 'pague ' + brl(p.total) + ' no caixa informando a sua senha.') +
    ' Vamos chamar pelo número quando ficar pronto' + (p.consumo === 'viagem' ? ', embalado para levar.' : '.') + '</p>' +
    '<button class="tt-pri" data-act="recomecar">Novo pedido</button><p class="tt-dica" id="tt-volta"></p></section>';
}

function render(){
  const app = $('#app');
  app.className = 'totem tela-' + S.tela;
  app.innerHTML = { inicio: telaInicio, cardapio: telaCardapio, carrinho: telaCarrinho, dados: telaDados, pix: telaPix, fim: telaFim }[S.tela]();
  if (S.tela === 'cardapio'){ const l = $('.tt-lista'); if (l) l.scrollTop = 0; }
}
function ir(t){ S.tela = t; render(); window.scrollTo(0, 0); }

/* ---------- produto ---------- */
function abrirProduto(id){
  const p = prod(id); if (!p || p.esgotado) return;
  S.item = { id, q: 1, sel: Opcoes.inicial(p) };
  desenharProduto();
}
function desenharProduto(){
  const p = prod(S.item.id), it = S.item;
  $('#modal').innerHTML = '<div class="tt-veu-m" data-fechar><div class="tt-prod" role="dialog" aria-modal="true" aria-labelledby="tp-n">' + foto(p, 'tt-pimg') +
    '<div class="tt-pb"><h2 id="tp-n">' + esc(p.nome) + '</h2><p>' + esc(p.descricao) + '</p>' +
    (p.opcoes || []).map((o, oi) => '<fieldset><legend>' + esc(o.nome) + ' <small>' + Opcoes.rotulo(o) + '</small></legend><div class="tt-ops">' + o.escolhas.map((e, ei) =>
      '<button type="button" class="tt-op" data-op="' + oi + ':' + ei + '" aria-pressed="' + it.sel[oi].includes(ei) + '"' + (e.esgotado ? ' disabled' : '') + '><span>' + esc(e.nome) + (e.esgotado ? ' <small>(esgotado)</small>' : '') + '</span>' + (o.tipo === 'sabores' ? '<b>' + brl(e.preco) + '</b>' : o.tipo !== 'combo' && e.preco ? '<b>+ ' + brl(e.preco) + '</b>' : '') + '</button>').join('') + '</div></fieldset>').join('') +
    '<div class="tt-pf"><div class="tt-step grande"><button data-iq="-1" aria-label="Menos">−</button><span>' + it.q + '</span><button data-iq="1" aria-label="Mais">+</button></div>' +
    '<button class="tt-pri" data-act="adicionar">Adicionar · ' + brl(unit(p, it.sel) * it.q) + '</button></div><button class="tt-sec tt-x" data-fechar>Cancelar</button></div></div></div>';
}
function fecharModal(){ $('#modal').innerHTML = ''; S.item = null; }
function adicionar(){
  const it = S.item, p = prod(it.id), k = it.id + '|' + JSON.stringify(it.sel), l = S.cart.find(x => x.k === k);
  if (l) l.q += it.q; else S.cart.push({ k, id: it.id, sel: it.sel, q: it.q });
  fecharModal(); render(); toast(it.q + '× ' + p.nome + ' no pedido');
}

/* ---------- finalizar ---------- */
async function finalizar(){
  const nome = ($('#tt-nome') || {}).value || S.nome; S.nome = nome.trim();
  if (S.nome.length < 2){ toast('Digite seu nome para chamarmos quando ficar pronto.'); const i = $('#tt-nome'); if (i) i.focus(); return; }
  S.enviando = true; render();
  try {
    const d = await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/pedidos', { tipo: 'retirada', totem: TOKEN, consumo: S.consumo, cliente: { nome: S.nome },
      itens: S.cart.map(l => ({ produto: l.id, qtd: l.q, escolhas: l.sel })), obs: S.consumo === 'viagem' ? 'Para levar' : '', pagamento: { metodo: S.pag } });
    S.ultimo = d.pedido; S.codigo = d.codigo; S.enviando = false; S.cart = [];
    if (d.pedido.status === 'aguardando' && d.pedido.pagamento && d.pedido.pagamento.pix){ ir('pix'); esperarPix(); return; }
    concluir(d.pedido);
  } catch (e) {
    S.enviando = false; render(); toast(e.message);
    if (e.status === 409) recarregar();
  }
}
function concluir(p){
  S.ultimo = p; ir('fim');
  if (IMPRIMIR && window.Cupom) Cupom.imprimir(p, R, 80).catch(() => {});
  contarFim();
}
// Pix automático: espera o pagamento (confere a cada 3 s) e só então mostra a senha
function esperarPix(){
  clearInterval(S.pixT);
  S.pixT = setInterval(async () => {
    if (S.tela !== 'pix' || !S.ultimo){ clearInterval(S.pixT); return; }
    try {
      const p = (await api('GET', '/api/acompanhar/' + encodeURIComponent(S.ultimo.id) + '?c=' + encodeURIComponent(S.codigo))).pedido;
      if (p.status === 'aguardando') return;
      clearInterval(S.pixT);
      if (p.status === 'cancelado'){ toast('O tempo para pagar acabou. Faça o pedido de novo.'); recomecar(); return; }
      concluir(p);
    } catch (e) {}
  }, 3000);
}
if (window.Pix) Pix.ligar(p => { if (S.tela === 'pix'){ clearInterval(S.pixT); concluir(p); } });
function telaPix(){
  return topo('Pague com Pix') + '<div class="tt-pagina estreita">' + Pix.bloco(S.ultimo, S.codigo, { grande: true }) +
    '<p class="tt-legal">Assim que o Pix cair, sua senha aparece aqui. Prefere pagar no caixa? Toque em Recomeçar e escolha "No caixa".</p></div>';
}
function contarFim(){
  let s = FIM_S; clearInterval(S.fimT);
  const tick = () => { const el = $('#tt-volta'); if (S.tela !== 'fim'){ clearInterval(S.fimT); return; } if (el) el.textContent = 'Voltando ao início em ' + s + ' s'; if (s-- <= 0){ clearInterval(S.fimT); recomecar(); } };
  tick(); S.fimT = setInterval(tick, 1000);
}
function recomecar(){ clearInterval(S.fimT); clearInterval(S.pixT); fecharAviso(); fecharModal(); S.cart = []; S.nome = ''; S.cat = null; S.pag = 'local'; S.ultimo = null; ir('inicio'); recarregar(); }
async function recarregar(){ try { const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG)); R = d.restaurante; P = d.produtos; S.cart = S.cart.filter(l => prod(l.id) && !prod(l.id).esgotado); if (S.tela === 'inicio' || S.tela === 'cardapio') render(); } catch (e) {} }

/* ---------- parado: pergunta se ainda tem alguém e recomeça ---------- */
function fecharAviso(){ if (S.aviso){ clearInterval(S.aviso); S.aviso = null; } const a = $('.tt-aviso'); if (a) a.remove(); }
setInterval(() => {
  if (S.tela === 'inicio' || S.tela === 'fim' || S.aviso || Date.now() - S.toque < (S.tela === 'pix' ? 5 * 60000 : PARADO_MS)) return; // pagando o Pix no celular: espera mais
  let s = AVISO_S; const box = document.createElement('div'); box.className = 'tt-aviso';
  box.innerHTML = '<div><h2>Ainda está aí?</h2><p>O pedido vai recomeçar em <strong id="tt-av">' + s + '</strong> segundos.</p><div class="tt-acoes"><button class="tt-sec" data-act="recomecar">Recomeçar</button><button class="tt-pri" data-act="continuar">Continuar pedido</button></div></div>';
  document.body.appendChild(box);
  S.aviso = setInterval(() => { s--; const el = $('#tt-av'); if (el) el.textContent = s; if (s <= 0) recomecar(); }, 1000);
}, 5000);
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { S.toque = Date.now(); }, true));

/* ---------- toques ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('button, [data-fechar]'); if (!el) return;
  const d = el.dataset;
  if ('fechar' in d && (e.target === el || el.tagName === 'BUTTON')){ fecharModal(); return; }
  if (d.comecar){ S.consumo = d.comecar; try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (err) {} ir('cardapio'); return; }
  if (d.cat){ S.cat = d.cat; render(); return; }
  if (d.ver){ abrirProduto(d.ver); return; }
  if (d.ir){ if (d.ir === 'dados'){ const i = $('#tt-nome'); if (i) S.nome = i.value; } ir(d.ir); return; }
  if (d.linha !== undefined){ const l = S.cart[+d.linha]; if (!l) return; l.q += +d.d; if (l.q <= 0) S.cart.splice(+d.linha, 1); if (!S.cart.length) ir('cardapio'); else render(); return; }
  if (d.op){ const [oi, ei] = d.op.split(':').map(Number), p = prod(S.item.id), o = p.opcoes[oi];
    Opcoes.alternar(prod(S.item.id), S.item.sel, oi, ei); if (o.tipo === 'varios') S.item.sel[oi].sort((a, b) => a - b);
    desenharProduto(); return; }
  if (d.iq){ S.item.q = Math.max(1, Math.min(20, S.item.q + +d.iq)); desenharProduto(); return; }
  if (d.consumo){ S.nome = ($('#tt-nome') || {}).value || S.nome; S.consumo = d.consumo; render(); return; }
  if (d.pag){ S.nome = ($('#tt-nome') || {}).value || S.nome; S.pag = d.pag; render(); return; }
  switch (d.act){
    case 'adicionar': { const er = Opcoes.validar(prod(S.item.id), S.item.sel); if (er){ toast(er); break; } adicionar(); break; }
    case 'finalizar': finalizar(); break;
    case 'recomecar': recomecar(); break;
    case 'continuar': fecharAviso(); S.toque = Date.now(); break;
    case 'recarregar': location.reload(); break;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); if (e.key === 'Enter' && e.target.id === 'tt-nome') finalizar(); });
document.addEventListener('contextmenu', e => e.preventDefault()); // toque longo não abre menu no totem
// foto que não carregar vira o quadro colorido com a inicial
document.addEventListener('error', e => { const img = e.target; if (!(img instanceof HTMLImageElement) || img.dataset.falhou) return; img.dataset.falhou = '1';
  const card = img.closest('[data-ver],[data-cat]'), nome = card ? (card.dataset.cat || (prod(card.dataset.ver) || {}).nome || '') : '';
  const ph = document.createElement('div'); ph.className = img.className + ' ph'; ph.setAttribute('aria-hidden', 'true'); ph.textContent = (nome || '•')[0]; img.replaceWith(ph); }, true);

/* ---------- início ---------- */
(async function(){
  try {
    if (!SLUG) throw new Error('Endereço do totem incompleto.');
    const v = await api('GET', '/api/r/' + encodeURIComponent(SLUG) + '/totem?t=' + encodeURIComponent(TOKEN));
    if (!v.valido){ $('#app').innerHTML = '<div class="tt-erro"><h1>Totem não liberado</h1><p>Abra o link do totem pelo painel do restaurante (Mesas, QR e totem). Se o código foi trocado, use o link novo.</p></div>'; return; }
    const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG)); R = d.restaurante; P = d.produtos;
  } catch (e) { $('#app').innerHTML = '<div class="tt-erro"><h1>Não foi possível abrir o totem</h1><p>' + esc(e.message) + '</p><button class="tt-pri" data-act="recarregar">Tentar de novo</button></div>'; return; }
  document.title = R.nome + ' · Autoatendimento';
  if (/^#[0-9a-f]{6}$/i.test(R.cor || '')) document.documentElement.style.setProperty('--cor', R.cor);
  render();
  setInterval(recarregar, 5 * 60 * 1000); // atualiza o cardápio (esgotados, preços) a cada 5 minutos
})();
})();
