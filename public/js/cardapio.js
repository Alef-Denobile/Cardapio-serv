/* Cardápio do cliente: delivery/retirada (/r/slug) ou mesa (/r/slug/mesa/N?t=código) */
(function(){
'use strict';
const { $, $$, esc, brl, norm, pad, hora, initials, toast, aplicarCor, foto, api, guardar, copiar, pagTxt, trocoTxt } = C;
const SELOS = ['vegetariano', 'vegano', 'sem glúten'];

const caminho = location.pathname.split('/').filter(Boolean); // ['r', slug, 'mesa', n]
const SLUG = decodeURIComponent(caminho[1] || '');
const MESA = caminho[2] === 'mesa' ? Math.trunc(Number(caminho[3])) || 0 : 0;
const TOKEN = new URLSearchParams(location.search).get('t') || '';
const CHAVE = 'acomp:' + SLUG;

let R = null, P = [];
const U = { tipo: MESA ? 'mesa' : 'delivery', mesaOk: false, cart: [], q: '', diet: new Set(), item: null, step: 'form', cur: null, socket: null,
  form: Object.assign({ nome: '', tel: '', end: '', compl: '', ref: '', bairro: '', obs: '', pag: MESA ? 'local' : 'cartao', troco: '' }, guardar.ler('cliente:' + SLUG, {})) };

const idxCat = cat => R.categorias.indexOf(cat);
function unitPrice(p, sel){ let v = p.preco; p.opcoes.forEach((o, oi) => (sel[oi] || []).forEach(ei => { const e = o.escolhas[ei]; if (e) v += e.preco || 0; })); return v; }
function selNames(p, sel){ const r = []; p.opcoes.forEach((o, oi) => (sel[oi] || []).forEach(ei => { const e = o.escolhas[ei]; if (e) r.push(e.nome); })); return r; }
function defaultSel(p){ const s = {}; p.opcoes.forEach((o, oi) => { s[oi] = o.tipo === 'um' ? [0] : []; }); return s; }
const prod = id => P.find(x => x.id === id);
const cartSub = () => U.cart.reduce((a, l) => { const p = prod(l.id); return a + (p ? unitPrice(p, l.sel) * l.qtd : 0); }, 0);
const cartCount = id => U.cart.filter(l => id == null || l.id === id).reduce((a, l) => a + l.qtd, 0);
function bairro(){ return R.delivery.bairros.find(b => b.nome === U.form.bairro) || R.delivery.bairros[0]; }
function calc(){ const sub = cartSub(); const serv = U.tipo === 'mesa' ? sub * R.taxaServico / 100 : 0; const g = R.delivery.gratisAcimaDe; const b = bairro();
  const ent = U.tipo === 'delivery' ? ((g && sub >= g) ? 0 : (b ? b.taxa : 0)) : 0; return { sub, serv, ent, total: sub + serv + ent }; }
const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão na entrega', dinheiro: 'Dinheiro' };
function payOpts(){ return (R.pagamentos[U.tipo] || []).filter(m => m !== 'online').map(m => [m, m === 'local' ? (U.tipo === 'mesa' ? 'Pagar na mesa' : 'Pagar na retirada') : NOMES_PAG[m]]); }
function fixPag(){ const o = payOpts(); if (!o.some(x => x[0] === U.form.pag)) U.form.pag = o.length ? o[o.length > 1 && U.tipo === 'delivery' ? 1 : o.length - 1][0] : ''; }
const temDelivery = () => R.tipos.includes('delivery');
const tiposOnline = () => R.tipos.filter(t => t !== 'mesa');
const podePedir = () => !!U.tipo && (R.aberto || R.aceitarForaDoHorario);

/* ---------- carregar ---------- */
async function iniciar(){
  try {
    const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG));
    R = d.restaurante; P = d.produtos;
  } catch (e) { $('#carregando').hidden = true; const f = $('#falha'); f.hidden = false; f.textContent = e.status === 404 ? 'Restaurante não encontrado. Confira o link.' : e.message; return; }
  document.title = R.nome + ' · Cardápio';
  aplicarCor(R.cor);
  if (!U.form.bairro && R.delivery.bairros[0]) U.form.bairro = R.delivery.bairros[0].nome;
  if (MESA){
    try { U.mesaOk = (await api('GET', '/api/r/' + encodeURIComponent(SLUG) + '/mesa/' + MESA + '?t=' + encodeURIComponent(TOKEN))).valida; } catch (e) { U.mesaOk = false; }
    if (!U.mesaOk) U.tipo = tiposOnline()[0] || '';
  }
  if (U.tipo !== 'mesa' && !R.tipos.includes(U.tipo)) U.tipo = tiposOnline()[0] || '';
  fixPag();
  $('#carregando').hidden = true; $('#v-cliente').hidden = false;
  renderHead(); renderMenu(); renderBar();
  retomarAcompanhamento();
}

function renderHead(){
  const mesa = U.tipo === 'mesa';
  const logo = R.logoUrl ? '<img class="logo" src="' + esc(R.logoUrl) + '" alt="Logo">' : '<div class="logo mono" aria-hidden="true">' + esc(initials(R.nome)) + '</div>';
  const fees = R.delivery.bairros.map(b => b.taxa);
  const info = mesa || !temDelivery() ? '' : '<p class="dinfo">Entrega em ' + esc(R.delivery.tempo) + (fees.length ? ' · taxa a partir de ' + brl(Math.min(...fees)) : '') + (R.delivery.gratisAcimaDe ? ' · grátis acima de ' + brl(R.delivery.gratisAcimaDe) : '') + '</p>';
  const tag = mesa ? 'Mesa ' + pad(MESA) : temDelivery() && R.tipos.includes('retirada') ? 'Delivery e retirada' : temDelivery() ? 'Delivery' : R.tipos.includes('retirada') ? 'Retirada no balcão' : 'Cardápio';
  $('#rest-head').innerHTML = logo + '<div><div class="table-tag">' + tag + '</div><h1>' + esc(R.nome) + '</h1>' + (R.frase ? '<p class="sub">' + esc(R.frase) + '</p>' : '') + info +
    '<span class="status ' + (R.aberto ? 'on' : 'off') + '">' + (R.aberto ? 'Aberto agora · fecha às ' + esc(R.fecha) : 'Fechado agora · abre às ' + esc(R.abre)) + '</span></div>';
  $('#actions').hidden = !mesa || !R.recursos.chamados;
  let av = '';
  if (MESA && !U.mesaOk) av += '<p class="warnbox">' + (R.recursos.mesa ? 'Este QR Code não é válido ou foi trocado. Peça ajuda ao garçom.' : 'Este restaurante não recebe pedidos pela mesa pelo celular. Faça o pedido com o garçom.') + (tiposOnline().length ? ' Você ainda pode pedir para ' + (temDelivery() && R.tipos.includes('retirada') ? 'retirar ou receber em casa' : temDelivery() ? 'receber em casa' : 'retirar no balcão') + '.' : '') + '</p>';
  if (!U.tipo) av += '<p class="warnbox">Este restaurante não está recebendo pedidos pelo celular no momento. Você pode ver o cardápio.</p>';
  if (!podePedir()) av += '<p class="warnbox">Estamos fechados agora. Você pode ver o cardápio, e os pedidos voltam às ' + esc(R.abre) + '.</p>';
  $('#avisos').innerHTML = av;
  $('#diets').innerHTML = SELOS.filter(s => P.some(p => p.selos.includes(s))).map(d => '<button class="chip" data-act="diet" data-d="' + d + '" aria-pressed="' + U.diet.has(d) + '">' + d[0].toUpperCase() + d.slice(1) + '</button>').join('');
}

function renderMenu(){
  const q = norm(U.q), filt = q || U.diet.size;
  const match = p => (!q || norm(p.nome + ' ' + p.descricao).includes(q)) && Array.from(U.diet).every(d => p.selos.includes(d));
  const dd = P.find(p => p.destaque && !p.esgotado);
  $('#destaque').innerHTML = (!filt && dd) ? '<div class="feat"><button class="ph" data-act="open" data-id="' + dd.id + '" aria-label="Ver ' + esc(dd.nome) + '">' + foto(dd, idxCat(dd.categoria)) + '</button><div><div class="eyebrow">Destaque da casa</div><h3>' + esc(dd.nome) + '</h3><p>' + esc(dd.descricao) + '</p><div class="row" style="margin:0"><span class="price">' + brl(dd.preco) + '</span><button class="btn sm" data-act="add" data-id="' + dd.id + '">Adicionar</button></div></div></div>' : '';
  const cats = R.categorias.concat([...new Set(P.map(p => p.categoria))].filter(c => !R.categorias.includes(c))).filter(c => P.some(p => p.categoria === c && match(p)));
  $('#cats').innerHTML = cats.map((c, i) => '<button data-act="cat" data-c="' + i + '" class="' + (i ? '' : 'on') + '">' + esc(c) + '</button>').join('');
  $('#cats').hidden = !cats.length;
  if (!cats.length){ $('#menu').innerHTML = '<p class="empty">Nenhum produto encontrado. Tente outra busca ou tire os filtros.</p>'; return; }
  $('#menu').innerHTML = cats.map((c, ci) => '<section class="cat" id="c' + ci + '"><h2>' + esc(c) + '</h2>' + P.filter(p => p.categoria === c && match(p)).map(p => {
    const n = cartCount(p.id);
    const tags = p.selos.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + (p.esgotado ? '<span class="tag off">esgotado</span>' : '');
    const extra = p.opcoes.some(o => o.escolhas.some(e => e.preco > 0));
    const ctl = p.esgotado ? '' : '<button class="add" data-act="add" data-id="' + p.id + '" aria-label="Adicionar ' + esc(p.nome) + '">+' + (n ? '<span class="inq">' + n + '</span>' : '') + '</button>';
    return '<article class="item' + (p.esgotado ? ' out' : '') + '"><button class="ph" data-act="open" data-id="' + p.id + '" aria-label="Ver ' + esc(p.nome) + '">' + foto(p, idxCat(p.categoria)) + '</button><div class="info"><h3><button class="link" data-act="open" data-id="' + p.id + '">' + esc(p.nome) + '</button></h3>' + (tags ? '<div class="tags">' + tags + '</div>' : '') + '<p>' + esc(p.descricao) + '</p></div><div class="side"><span class="price">' + brl(p.preco) + (extra ? '<small> +</small>' : '') + '</span>' + ctl + '</div></article>';
  }).join('') + '</section>').join('');
}

function ativos(){ return guardar.ler(CHAVE, []); }
function renderBar(){
  const n = cartCount();
  const a = U.cur && U.cur.status !== 'entregue' && U.cur.status !== 'cancelado' ? U.cur : null;
  if (n){ $('#bar-in').innerHTML = '<div><strong>' + n + ' ' + (n > 1 ? 'itens' : 'item') + '</strong><br><span class="price">' + brl(cartSub()) + '</span></div><button class="btn" data-act="cart">Ver pedido</button>'; $('#bar').hidden = false; }
  else if (a){ $('#bar-in').innerHTML = '<div><strong>Pedido #' + a.numero + '</strong><br><span class="note" style="margin:0">' + C.STATUS[a.status] + '</span></div><button class="btn ghost" data-act="track">Acompanhar</button>'; $('#bar').hidden = false; }
  else $('#bar').hidden = true;
}

function addToCart(id, sel, qtd){
  const key = id + '|' + JSON.stringify(sel); const ex = U.cart.find(l => l.key === key);
  if (ex) ex.qtd += qtd; else U.cart.push({ key, id, sel, qtd });
  toast(qtd + '× ' + prod(id).nome + ' no pedido'); renderMenu(); renderBar();
}
function openItem(id){
  const p = prod(id); if (!p) return;
  U.item = { id, sel: defaultSel(p), qtd: 1 };
  const opts = p.opcoes.map((o, oi) => '<fieldset><legend>' + esc(o.nome) + ' <small>' + (o.tipo === 'um' ? 'escolha 1' : 'opcional') + '</small></legend>' + o.escolhas.map((e, ei) =>
    '<label class="opt" for="o' + oi + '_' + ei + '"><input type="' + (o.tipo === 'um' ? 'radio' : 'checkbox') + '" name="o' + oi + '" id="o' + oi + '_' + ei + '" data-oi="' + oi + '" data-ei="' + ei + '"' + (U.item.sel[oi].includes(ei) ? ' checked' : '') + '><span>' + esc(e.nome) + '</span><span class="price">' + (e.preco ? '+ ' + brl(e.preco) : '') + '</span></label>').join('') + '</fieldset>').join('');
  $('#item-panel').innerHTML = '<div class="hero-ph"><div class="ph">' + foto(p, idxCat(p.categoria)) + '</div></div><div class="sh-head"><h2>' + esc(p.nome) + '</h2><button class="x" data-act="close" aria-label="Fechar">×</button></div><p class="sub">' + esc(p.descricao) + '</p>' +
    (p.esgotado ? '<p class="warnbox">Esgotado no momento.</p>' : opts + '<div class="row between"><div class="qty"><button data-act="iq" data-d="-1" aria-label="Menos">−</button><span id="iq">1</span><button data-act="iq" data-d="1" aria-label="Mais">+</button></div><button class="btn" data-act="confirm-item" id="ci-btn"></button></div>');
  updItemBtn(); $('#sheet-item').hidden = false;
}
function updItemBtn(){ const b = $('#ci-btn'); if (!b) return; b.textContent = 'Adicionar · ' + brl(unitPrice(prod(U.item.id), U.item.sel) * U.item.qtd); $('#iq').textContent = U.item.qtd; }

/* ---------- carrinho e envio ---------- */
function openCart(step){ U.step = step || 'form'; renderCart(); $('#sheet-cart').hidden = false; $('#cart-panel').scrollTop = 0; }
const head = t => '<div class="sh-head"><h2>' + t + '</h2><button class="x" data-act="close" aria-label="Fechar">×</button></div>';
function renderCart(){
  const P0 = $('#cart-panel'), F = U.form;
  if (U.step !== 'form') return renderStatus();
  if (!U.cart.length){ P0.innerHTML = head('Seu pedido') + '<p class="empty">Seu pedido está vazio.</p>'; return; }
  fixPag();
  const t = calc(), dl = U.tipo === 'delivery', g = R.delivery.gratisAcimaDe;
  const minOk = !dl || t.sub >= R.delivery.pedidoMinimo;
  const lines = U.cart.map((l, i) => { const p = prod(l.id); const on = selNames(p, l.sel);
    return '<div class="cline"><div><strong>' + esc(p.nome) + '</strong>' + (on.length ? '<small class="note" style="display:block;margin:0">' + esc(on.join(' · ')) + '</small>' : '') + '</div><span class="price">' + brl(unitPrice(p, l.sel) * l.qtd) + '</span><div class="qty"><button data-act="cq" data-i="' + i + '" data-d="-1" aria-label="Menos">−</button><span>' + l.qtd + '</span><button data-act="cq" data-i="' + i + '" data-d="1" aria-label="Mais">+</button></div></div>'; }).join('');
  const tipos = tiposOnline().map(t => [t, t === 'delivery' ? 'Entrega' : 'Retirar no balcão']);
  const tipoSel = U.tipo === 'mesa' ? '<p class="eta">Pedido para a Mesa ' + pad(MESA) + '</p>' :
    '<label>Como você quer receber?</label><div class="seg2" style="grid-template-columns:repeat(' + tipos.length + ',1fr)">' + tipos.map(o => '<button data-act="tipo" data-t="' + o[0] + '" aria-pressed="' + (U.tipo === o[0]) + '">' + o[1] + '</button>').join('') + '</div><p class="eta">' + (dl ? 'Previsão de entrega: ' + esc(R.delivery.tempo) : 'Pronto para retirar em ' + esc(R.delivery.tempoRetirada)) + '</p>';
  P0.innerHTML = head('Seu pedido') + lines + tipoSel +
    '<div class="grid2"><div><label for="c-nome">Seu nome</label><input id="c-nome" data-f="nome" autocomplete="name" value="' + esc(F.nome) + '"></div>' + (U.tipo !== 'mesa' ? '<div><label for="c-tel">WhatsApp com DDD</label><input id="c-tel" data-f="tel" inputmode="tel" autocomplete="tel" placeholder="(15) 99999-0000" value="' + esc(F.tel) + '"></div>' : '') + '</div>' +
    (dl ? '<div class="grid2"><div><label for="c-end">Rua e número</label><input id="c-end" data-f="end" autocomplete="street-address" placeholder="Rua das Flores, 120" value="' + esc(F.end) + '"></div><div><label for="c-compl">Complemento</label><input id="c-compl" data-f="compl" placeholder="Apto, bloco, casa" value="' + esc(F.compl) + '"></div>' +
      '<div><label for="c-bairro">Bairro</label><select id="c-bairro" data-f="bairro">' + R.delivery.bairros.map(b => '<option' + (b.nome === F.bairro ? ' selected' : '') + ' value="' + esc(b.nome) + '">' + esc(b.nome) + ' · ' + brl(b.taxa) + '</option>').join('') + '</select></div><div><label for="c-ref">Ponto de referência</label><input id="c-ref" data-f="ref" placeholder="Perto da padaria" value="' + esc(F.ref) + '"></div></div>' : '') +
    '<label for="c-obs">Observações</label><textarea id="c-obs" data-f="obs" rows="2" placeholder="Ex.: sem cebola, mandar talheres">' + esc(F.obs) + '</textarea>' +
    '<label>Pagamento</label><div class="seg2" style="grid-template-columns:repeat(' + payOpts().length + ',1fr)">' + payOpts().map(o => '<button data-act="pag" data-p="' + o[0] + '" aria-pressed="' + (F.pag === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
    (dl ? '<label for="c-cpf">CPF <small class="note">(pedimos para evitar pedidos falsos)</small></label><input id="c-cpf" data-f="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" value="' + esc(F.cpf || '') + '">' : '') +
    (F.pag === 'dinheiro' ? '<label for="c-troco">Troco para quanto? <small class="note">(deixe vazio se não precisar)</small></label><input id="c-troco" data-f="troco" type="number" min="0" step="1" placeholder="Ex.: 100" value="' + esc(F.troco) + '">' : '') +
    '<div style="margin-top:14px"><div class="line"><span>Subtotal</span><span>' + brl(t.sub) + '</span></div>' + (t.serv ? '<div class="line"><span>Taxa de serviço (' + R.taxaServico + '%)</span><span>' + brl(t.serv) + '</span></div>' : '') +
    (dl ? '<div class="line"><span>Entrega · ' + esc(F.bairro) + '</span><span>' + (t.ent ? brl(t.ent) : 'Grátis') + '</span></div>' : '') + '<div class="line total"><span>Total</span><span>' + brl(t.total) + '</span></div></div>' +
    (dl && g && t.sub < g ? '<p class="note">Faltam ' + brl(g - t.sub) + ' para a entrega sair grátis.</p>' : '') +
    (minOk ? '' : '<p class="warnbox">Pedido mínimo para entrega: ' + brl(R.delivery.pedidoMinimo) + '. Faltam ' + brl(R.delivery.pedidoMinimo - t.sub) + '.</p>') +
    (podePedir() ? '' : '<p class="warnbox">Estamos fechados agora. Os pedidos voltam às ' + esc(R.abre) + '.</p>') +
    '<div class="row"><button class="btn" data-act="send" id="send"' + (minOk && podePedir() ? '' : ' disabled') + '>Enviar pedido · ' + brl(t.total) + '</button><button class="btn ghost" data-act="close">Continuar escolhendo</button></div>';
}

async function enviar(){
  const F = U.form, btn = $('#send');
  const corpo = {
    tipo: U.tipo, mesa: U.tipo === 'mesa' ? { numero: MESA, token: TOKEN } : undefined,
    cliente: { nome: F.nome, tel: F.tel, cpf: U.tipo === 'delivery' ? F.cpf : undefined },
    entrega: U.tipo === 'delivery' ? { endereco: F.end, complemento: F.compl, referencia: F.ref, bairro: F.bairro } : undefined,
    itens: U.cart.map(l => ({ produto: l.id, qtd: l.qtd, escolhas: l.sel })), obs: F.obs,
    pagamento: { metodo: F.pag, troco: F.pag === 'dinheiro' ? F.troco : 0 }
  };
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const d = await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/pedidos', corpo);
    guardar.gravar('cliente:' + SLUG, { nome: F.nome, tel: F.tel, end: F.end, compl: F.compl, ref: F.ref, bairro: F.bairro });
    const lista = ativos().filter(x => x.id !== d.pedido.id).slice(-4); lista.push({ id: d.pedido.id, codigo: d.codigo }); guardar.gravar(CHAVE, lista);
    U.cart = []; F.obs = ''; F.troco = '';
    acompanhar(d.pedido, d.codigo);
    renderMenu(); openCart('status');
  } catch (e) {
    toast(e.message); btn.disabled = false; btn.textContent = 'Tentar enviar de novo';
    if (e.status === 409 || e.status === 400 && /produto/i.test(e.message)) atualizarCardapio();
  }
}
async function atualizarCardapio(){ try { const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG)); P = d.produtos; R = d.restaurante; U.cart = U.cart.filter(l => prod(l.id) && !prod(l.id).esgotado); renderMenu(); renderBar(); if (!$('#sheet-cart').hidden) renderCart(); } catch (e) {} }

/* ---------- acompanhamento em tempo real ---------- */
function acompanhar(pedido, codigo){
  U.cur = pedido;
  if (U.socket) U.socket.close();
  if (typeof io === 'function'){
    U.socket = io({ auth: { pedido: pedido.id, codigo } });
    U.socket.on('pedido:atualizado', p => { U.cur = p; renderBar(); if (!$('#sheet-cart').hidden && U.step === 'status') renderStatus(); if (p.status === 'entregue' || p.status === 'cancelado') toast('Pedido #' + p.numero + ': ' + C.STATUS[p.status].toLowerCase()); });
  }
  renderBar();
}
async function retomarAcompanhamento(){
  const l = ativos(); const ult = l[l.length - 1]; if (!ult) return;
  try { const d = await api('GET', '/api/acompanhar/' + ult.id + '?c=' + encodeURIComponent(ult.codigo)); if (['entregue', 'cancelado'].includes(d.pedido.status) && Date.now() - new Date(d.pedido.criadoEm) > 3 * 3600000) return; acompanhar(d.pedido, ult.codigo); } catch (e) {}
}
function etapas(p){
  if (p.tipo === 'delivery') return [['novo', 'Recebido'], ['preparo', 'Em preparo'], ['rota', 'Saiu para entrega'], ['entregue', 'Entregue']];
  if (p.tipo === 'retirada') return [['novo', 'Recebido'], ['preparo', 'Em preparo'], ['pronto', 'Pronto para retirar'], ['entregue', 'Retirado']];
  return [['novo', 'Recebido'], ['preparo', 'Em preparo'], ['pronto', 'Pronto']];
}
const ORDEM = ['novo', 'preparo', 'pronto', 'rota', 'entregue'];
function titulo(p){
  const d = p.tipo === 'delivery', r = p.tipo === 'retirada';
  return { novo: 'Pedido recebido pelo restaurante', preparo: 'Seu pedido está sendo preparado', pronto: d ? 'Pronto! Aguardando o entregador sair' : r ? 'Pronto para retirar no balcão' : 'Seu pedido está pronto!',
    rota: 'Saiu para entrega' + (p.entregador ? ' com ' + p.entregador.nome : ''), entregue: d ? 'Pedido entregue. Bom apetite!' : 'Pedido finalizado. Bom apetite!', cancelado: 'Pedido cancelado pelo restaurante' }[p.status];
}
function renderStatus(){
  const p = U.cur; if (!p) return;
  const st = etapas(p), cur = ORDEM.indexOf(p.status), dl = p.tipo === 'delivery';
  const pix = p.pagamento.metodo === 'pix' && !p.pagamento.pago && p.status !== 'cancelado';
  $('#cart-panel').innerHTML = head('Pedido #' + p.numero) + '<p class="ok"' + (p.status === 'cancelado' ? ' style="color:var(--crit)"' : '') + '>' + esc(titulo(p)) + '</p>' +
    (p.status === 'cancelado' ? '' : '<div class="track" style="grid-template-columns:repeat(' + st.length + ',1fr)">' + st.map(s => '<div class="' + (ORDEM.indexOf(s[0]) <= cur ? 'done' : '') + '">' + s[1] + '</div>').join('') + '</div>') +
    (pix ? '<div class="pixbox card"><strong>Pague ' + brl(p.total) + ' com Pix</strong>' + (R.chavePix ? '<span class="note" style="margin:0">Chave Pix do restaurante:</span><div class="code" id="pix-chave">' + esc(R.chavePix) + '</div><button class="btn sm" data-act="copiar-pix">Copiar chave Pix</button>' : '<span class="note" style="margin:0">O restaurante vai te enviar a chave Pix pelo WhatsApp.</span>') + '<span class="note" style="margin:0">Assim que o restaurante confirmar o pagamento, esta tela atualiza.</span></div>' : '') +
    (dl && p.entrega ? '<div class="addr">' + esc(p.entrega.endereco + (p.entrega.complemento ? ', ' + p.entrega.complemento : '') + ' · ' + p.entrega.bairro) + '</div>' : '') +
    '<div style="margin-top:10px">' + p.linhas.map(l => '<div class="line"><span>' + l.qtd + '× ' + esc(l.nome) + (l.opcoes.length ? '<small>' + esc(l.opcoes.join(' · ')) + '</small>' : '') + '</span><span>' + brl(l.unit * l.qtd) + '</span></div>').join('') +
    (dl ? '<div class="line"><span>Entrega</span><span>' + (p.taxaEntrega ? brl(p.taxaEntrega) : 'Grátis') + '</span></div>' : '') + (p.servico ? '<div class="line"><span>Taxa de serviço</span><span>' + brl(p.servico) + '</span></div>' : '') +
    '<div class="line total"><span>Total</span><span>' + brl(p.total) + '</span></div><p class="note">' + esc(p.pagamento.pago ? 'Pagamento confirmado' : pagTxt(p)) + (trocoTxt(p) ? ' · ' + esc(trocoTxt(p)) : '') + '</p></div>' +
    '<p class="note">Feito às ' + hora(p.criadoEm) + '. Esta tela se atualiza sozinha.</p>' +
    '<div class="row"><button class="btn" data-act="close">Voltar ao cardápio</button></div>';
}

/* ---------- eventos ---------- */
function fechar(){ $('#sheet-item').hidden = true; $('#sheet-cart').hidden = true; U.step = 'form'; renderBar(); }
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a){
    case 'diet': U.diet.has(el.dataset.d) ? U.diet.delete(el.dataset.d) : U.diet.add(el.dataset.d); el.setAttribute('aria-pressed', U.diet.has(el.dataset.d)); renderMenu(); break;
    case 'cat': { const s = $('#c' + el.dataset.c); $$('#cats button').forEach(b => b.classList.toggle('on', b === el)); if (s) s.scrollIntoView({ block: 'start' }); break; }
    case 'open': openItem(id); break;
    case 'add': { const p = prod(id); if (!p || p.esgotado) break; if (p.opcoes.length) openItem(id); else addToCart(id, {}, 1); break; }
    case 'iq': U.item.qtd = Math.max(1, U.item.qtd + +el.dataset.d); updItemBtn(); break;
    case 'confirm-item': addToCart(U.item.id, U.item.sel, U.item.qtd); $('#sheet-item').hidden = true; break;
    case 'close': fechar(); break;
    case 'cart': openCart('form'); break;
    case 'track': openCart('status'); break;
    case 'cq': { const l = U.cart[+el.dataset.i]; l.qtd += +el.dataset.d; if (l.qtd <= 0) U.cart.splice(+el.dataset.i, 1); renderCart(); renderMenu(); renderBar(); break; }
    case 'tipo': U.tipo = el.dataset.t; fixPag(); renderCart(); break;
    case 'pag': U.form.pag = el.dataset.p; renderCart(); break;
    case 'send': enviar(); break;
    case 'copiar-pix': copiar(R.chavePix); break;
    case 'call': try { await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/chamados', { mesa: MESA, token: TOKEN, tipo: el.dataset.t }); toast(el.dataset.t === 'conta' ? 'Conta solicitada. O garçom já vem.' : 'Garçom chamado para a Mesa ' + pad(MESA) + '.'); } catch (err) { toast(err.message); } break;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q'){ U.q = t.value; renderMenu(); return; }
  if (t.dataset.f){ U.form[t.dataset.f] = t.value; if (t.dataset.f === 'bairro') renderCart(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.oi != null && U.item){ const p = prod(U.item.id), oi = +t.dataset.oi, ei = +t.dataset.ei;
    if (p.opcoes[oi].tipo === 'um') U.item.sel[oi] = [ei]; else { const s = new Set(U.item.sel[oi]); t.checked ? s.add(ei) : s.delete(ei); U.item.sel[oi] = Array.from(s).sort((a, b) => a - b); } updItemBtn(); }
});
['sheet-item', 'sheet-cart'].forEach(id => $('#' + id).addEventListener('click', e => { if (e.target.id === id) fechar(); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

iniciar();
})();
