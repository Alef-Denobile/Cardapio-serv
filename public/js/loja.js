/* Site do restaurante: vitrine, cardápio, carrinho e pedidos de UM restaurante.
   Abre em /r/<endereço-do-restaurante> e, na página inicial (/), mostra o restaurante principal do site. */
(function(){
'use strict';
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = v => 'R$ ' + (Number.isInteger(+v) ? v : (+v).toFixed(2).replace('.', ','));
const fmtCpf = v => { const d = String(v || '').replace(/\D/g, '').slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4'); };
function cpfValido(v){ const d = String(v || '').replace(/\D/g, ''); if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false; for (const n of [9, 10]){ let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); if ((s * 10) % 11 % 10 !== +d[n]) return false; } return true; }
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ler = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
function toast(t){ const el = $('#toast'); el.classList.remove('com-link'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2800); }
// Mensagem breve depois de adicionar, com o atalho para o carrinho em destaque
function avisoAdicionado(q, nome){
  const el = $('#toast'); el.classList.add('com-link');
  el.innerHTML = '<span>' + (q > 1 ? q + '× ' : '') + esc(nome) + ' adicionado</span><button type="button" class="toast-link" data-go="carrinho">Ir para o carrinho</button>';
  el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3500);
}
async function api(m, url, corpo){
  let r;
  try { r = await fetch(url, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}), body: corpo ? JSON.stringify(corpo) : undefined }); }
  catch (e) { throw new Error('Sem conexão. Confira a internet e tente de novo.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && !/\/(login|cadastro)$/.test(url)) sairDaConta();
  if (!r.ok) throw Object.assign(new Error(d.erro || 'Algo deu errado. Tente de novo.'), { status: r.status });
  return d;
}

/* ---------- estado ---------- */
let SLUG = '', R = null, P = [], PROMOS = [];
const S = { rota: 'home', cat: null, q: '', slide: 0, cart: [], ordem: 'rel',
  meus: ler('chef:pedidos', []).filter(x => x && x.id && x.c), token: ler('chef:token', ''), user: ler('chef:user', null),
  checkout: Object.assign({ tipo: 'delivery', pag: '', nome: '', end: '', compl: '', bairro: '', tel: '', troco: '', obs: '' }, ler('loja:checkout', {})),
  pedidos: [], pedidosCarregados: false, socket: null, aval: {} };
const salvar = () => {
  gravar('loja:' + SLUG + ':cart', S.cart); gravar('chef:pedidos', S.meus.slice(0, 30)); gravar('chef:token', S.token || null); gravar('chef:user', S.user || null);
  const C = S.checkout; gravar('loja:checkout', { tipo: C.tipo, pag: C.pag, nome: C.nome, tel: C.tel, end: C.end, compl: C.compl, bairro: C.bairro }); // o CPF não fica salvo no aparelho
};
const prod = id => P.find(p => p.id === id);
const noCarrinho = id => S.cart.filter(x => x.id === id).reduce((a, x) => a + x.q, 0);
const selo = n => n ? '<span class="qtd-carr" aria-label="' + n + ' no carrinho">' + n + '</span>' : '';
const unitario = (p, sel) => p.preco + (p.opcoes || []).reduce((a, o, oi) => a + ((sel && sel[oi]) || []).reduce((b, x) => b + ((o.escolhas[x] || {}).preco || 0), 0), 0);
const nomesSel = (p, sel) => (p.opcoes || []).flatMap((o, oi) => ((sel && sel[oi]) || []).map(x => (o.escolhas[x] || {}).nome)).filter(Boolean);

/* ---------- peças visuais ---------- */
function foto(url, alt, cls, letra){ return url ? '<img class="' + cls + '" src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy">' : '<div class="' + cls + ' ph" aria-hidden="true">' + esc(letra) + '</div>'; }
const STAR = '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"/>';
function estrelas(n, comNumero, qtd){
  if (n == null) return '<span class="novo">Novo</span>';
  const k = Math.round(n); let h = '<span class="estrelas" role="img" aria-label="Nota ' + String(n).replace('.', ',') + ' de 5">';
  for (let i = 1; i <= 5; i++) h += '<svg viewBox="0 0 24 24" fill="' + (i <= k ? 'var(--gold)' : 'var(--star-off)') + '" aria-hidden="true">' + STAR + '</svg>';
  return h + (comNumero ? '<span class="nota">' + (+n).toFixed(1).replace('.', ',') + (qtd ? ' (' + qtd + ')' : '') + '</span>' : '') + '</span>';
}
const ICO = {
  mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  moto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h5l3-6h-4l-2-3H8M14 11l-3 6"/></svg>',
  sacola: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
  carr: '<svg class="carr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 4h3l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>'
};
const seta = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
function cardPrato(p){
  return '<article class="card"><button class="card-in" data-ver="' + p.id + '" aria-label="Ver ' + esc(p.nome) + '">' + foto(p.fotoUrl, p.nome, 'img', p.nome[0]) +
    '<div class="bd"><h3>' + esc(p.nome) + '</h3><span class="rest">' + esc(p.descricao) + '</span><div class="ft"><span class="cat-tag">' + esc(p.categoria) + '</span><span class="preco">' + brlCurto(p.preco) + '</span></div></div></button>' +
    (p.esgotado ? '<span class="esg">Esgotado</span>' : '<button class="add-r' + (noCarrinho(p.id) ? ' tem' : '') + '" data-add="' + p.id + '" aria-label="Adicionar ' + esc(p.nome) + ' ao carrinho">' + ICO.mais + selo(noCarrinho(p.id)) + '</button>') + '</article>';
}
function trilho(id, titulo, conteudo, extra, cls){
  return '<section><div class="sec-h"><h2>' + titulo + '</h2><div class="ctrl">' + (extra || '') + '<button class="seta" data-rail="' + id + '" data-dir="-1" aria-label="Anterior">' + ICO.esq + '</button><button class="seta" data-rail="' + id + '" data-dir="1" aria-label="Próximo">' + ICO.dir + '</button></div></div><div class="rail ' + (cls || '') + '" id="' + id + '">' + conteudo + '</div></section>';
}
const tiposOnline = () => (R.tipos || []).filter(t => t !== 'mesa');
const podePedir = () => R.aberto || R.aceitarForaDoHorario;
const categorias = () => (R.categorias || []).concat([...new Set(P.map(p => p.categoria))].filter(c => !(R.categorias || []).includes(c))).filter(c => P.some(p => p.categoria === c));

/* ---------- telas ---------- */
function infoRest(){
  const d = R.delivery || {}, a = R.avaliacoes || {}, tipos = tiposOnline();
  const taxas = (d.bairros || []).map(b => b.taxa);
  return '<section class="rinfo-box"><div class="rinfo"><div><h1>' + esc(R.nome) + '</h1>' + (R.frase ? '<p class="frase">' + esc(R.frase) + '</p>' : '') + '</div>' +
    '<div class="nota-box">' + estrelas(a.media, true, a.qtd) + '</div></div>' +
    '<div class="metas"><span class="meta ' + (R.aberto ? 'aberto' : 'fechado') + '">' + ICO.relogio + (R.aberto ? 'Aberto agora · até ' + esc(R.fecha) : 'Fechado · abre às ' + esc(R.abre)) + '</span>' +
    (tipos.includes('delivery') ? '<span class="meta">' + ICO.moto + 'Entrega em ' + esc(d.tempo) + (taxas.length ? ' · a partir de ' + brl(Math.min(...taxas)) : '') + '</span>' : '') +
    (tipos.includes('retirada') ? '<span class="meta">' + ICO.sacola + 'Retirada em ' + esc(d.tempoRetirada) + '</span>' : '') +
    (tipos.includes('delivery') && d.gratisAcimaDe ? '<span class="meta">Entrega grátis acima de ' + brl(d.gratisAcimaDe) + '</span>' : '') + '</div></section>';
}
function telaHome(){
  const slides = PROMOS.map((p, i) => '<div class="slide" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' de ' + PROMOS.length + '"><div class="foto"><img src="' + esc(p.fotoUrl) + '" alt=""></div>' +
    '<div class="selo" aria-hidden="true"><div><small>Por</small><strong>' + brlCurto(p.preco) + '</strong></div></div>' +
    '<div class="txt"><span class="eyebrow">Destaque da casa</span><h3>' + esc(p.nome) + '</h3><p>' + esc(p.descricao) + '</p><button class="cta" data-add="' + p.id + '">Eu quero!</button></div></div>').join('');
  const cats = categorias();
  const sugest = P.filter(p => !p.esgotado).slice().sort((a, b) => (b.destaque ? 2 : 0) + (b.fotoUrl ? 1 : 0) - (a.destaque ? 2 : 0) - (a.fotoUrl ? 1 : 0)).slice(0, 10);
  const recs = (R.avaliacoes && R.avaliacoes.recentes) || [];
  return (PROMOS.length ? '<section class="hero" aria-roledescription="carrossel" aria-label="Destaques"><div class="slides" id="slides">' + slides + '</div>' +
      (PROMOS.length > 1 ? '<button class="seta ant" data-slide="-1" aria-label="Destaque anterior">' + ICO.esq + '</button><button class="seta prox" data-slide="1" aria-label="Próximo destaque">' + ICO.dir + '</button><div class="dots">' + PROMOS.map((s, i) => '<button data-ir="' + i + '" aria-label="Ir para o destaque ' + (i + 1) + '"></button>').join('') + '</div>' : '') + '</section>' : '') +
    infoRest() +
    (cats.length > 1 ? trilho('r-cats', 'O que você está procurando', cats.map(c => { const p = P.find(x => x.categoria === c && x.fotoUrl) || P.find(x => x.categoria === c); return '<button class="cat" data-cat="' + esc(c) + '"><span class="ci">' + foto(p.fotoUrl, c, '', c[0]) + '</span>' + esc(c) + '</button>'; }).join(''), '', 'cats') : '') +
    trilho('r-chef', 'Sugestão do chef', sugest.map(cardPrato).join(''), '<button class="ver" data-go="cardapio">Ver cardápio completo ' + seta + '</button>') +
    (recs.length ? trilho('r-recs', 'Os clientes recomendam', recs.map(a => '<figure class="rec" style="margin:0 0 14px"><div class="av" aria-hidden="true">' + esc(a.nome.split(' ').map(w => w[0]).join('').slice(0, 2)) + '</div><div><h3>' + esc(a.nome) + ' recomenda:</h3><blockquote style="margin:0"><p>' + esc(a.comentario) + '</p></blockquote><div style="margin-top:6px">' + estrelas(a.nota) + '</div></div></figure>').join(''), '', 'recs') : '') +
    '<section class="sobre-box"><div><h2>Sobre o ' + esc(R.nome) + '</h2><p>' + esc(R.sobre || R.frase || '') + '</p></div><div class="sobre-dados"><p><strong>Horário:</strong> ' + esc(R.abre) + ' às ' + esc(R.fecha) + '</p>' +
      (R.whatsapp ? '<p><strong>WhatsApp:</strong> ' + esc(R.whatsapp) + '</p>' : '') + ((R.delivery.bairros || []).length && tiposOnline().includes('delivery') ? '<p><strong>Entregamos em:</strong> ' + R.delivery.bairros.map(b => esc(b.nome)).join(', ') + '</p>' : '') +
      '<button class="btn" data-go="cardapio">Ver o cardápio</button></div></section>';
}
function telaCardapio(){
  const q = norm(S.q), cats = categorias();
  let l = P.filter(p => (!S.cat || p.categoria === S.cat) && (!q || norm(p.nome + ' ' + p.descricao + ' ' + p.categoria).includes(q)));
  if (S.ordem === 'menor') l = l.slice().sort((a, b) => a.preco - b.preco);
  if (S.ordem === 'maior') l = l.slice().sort((a, b) => b.preco - a.preco);
  const grupos = S.ordem === 'rel' ? cats.filter(c => l.some(p => p.categoria === c)) : [null];
  return '<div class="cardapio"><div><div class="sec-h"><h2>' + (S.q ? 'Resultados para “' + esc(S.q) + '”' : S.cat ? esc(S.cat) : 'Cardápio') + '</h2><span class="nota">' + l.length + ' ' + (l.length === 1 ? 'item' : 'itens') + '</span></div>' +
    '<div class="barra-f"><button class="chip" data-cat="" aria-pressed="' + (!S.cat) + '">Todos</button>' + cats.map(c => '<button class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (S.cat === c) + '">' + esc(c) + '</button>').join('') +
      (S.q ? '<button class="chip" data-act="limpar-q">Limpar busca ×</button>' : '') + '<label class="ordem"><span class="sr">Ordenar</span><select id="f-ordem"><option value="rel">Por categoria</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option></select></label></div>' +
    (l.length ? grupos.map(g => (g ? '<h2 class="menu-h">' + esc(g) + '</h2>' : '') + l.filter(p => !g || p.categoria === g).map(itemLinha).join('')).join('') :
      '<div class="vazio-g"><strong>Nada encontrado</strong>Tente outra palavra ou outra categoria.</div>') +
    '</div>';
}
function itemLinha(p){
  const q = S.cart.filter(x => x.id === p.id).reduce((a, x) => a + x.q, 0);
  return '<div class="item" id="p-' + p.id + '"><button class="item-ver" data-ver="' + p.id + '" aria-label="Ver ' + esc(p.nome) + '">' + foto(p.fotoUrl, p.nome, 'th', p.nome[0]) + '</button><div style="min-width:0"><h3><button class="link-ver" data-ver="' + p.id + '">' + esc(p.nome) + '</button></h3><p>' + esc(p.descricao) + '</p>' +
    ((p.selos || []).length ? '<div class="selos">' + p.selos.map(s => '<span>' + esc(s) + '</span>').join('') + '</div>' : '') + ((p.opcoes || []).length ? '<p class="op-tag">Escolha ' + p.opcoes.map(o => esc(o.nome.toLowerCase())).join(' e ') + '</p>' : '') + '</div>' +
    '<div class="lado"><span class="preco">' + ((p.opcoes || []).some(o => o.escolhas.some(e => e.preco)) ? '<small>a partir de</small> ' : '') + brlCurto(p.preco) + '</span>' +
    (p.esgotado ? '<span class="esg-t">Esgotado</span>' : '<button class="btn add-btn" data-add="' + p.id + '" aria-label="Adicionar ' + esc(p.nome) + ' ao carrinho">' + ICO.mais + 'Adicionar' + selo(q) + '</button>') + '</div></div>';
}
function telaProduto(){
  const p = prod(S.pid);
  if (!p) return '<div class="vazio-g"><strong>Prato não encontrado</strong>Ele pode ter saído do cardápio.<div style="margin-top:14px"><button class="btn" data-go="cardapio">Ver o cardápio</button></div></div>';
  const outros = P.filter(x => x.categoria === p.categoria && x.id !== p.id), q = S.qtdProd || 1;
  const noCarr = S.cart.filter(x => x.id === p.id).reduce((a, x) => a + x.q, 0);
  return '<div class="prod-voltar"><button class="chip" data-act="voltar">' + ICO.esq + 'Voltar</button><button class="chip" data-cat="' + esc(p.categoria) + '">Todos de ' + esc(p.categoria) + '</button></div>' +
    '<section class="prod"><div class="prod-foto">' + foto(p.fotoUrl, p.nome, 'pf', p.nome[0]) + '</div>' +
    '<form class="prod-info" id="f-prod" data-id="' + p.id + '" novalidate><span class="cat-tag">' + esc(p.categoria) + '</span><h1>' + esc(p.nome) + '</h1><p class="desc">' + esc(p.descricao) + '</p>' +
      ((p.selos || []).length ? '<div class="selos">' + p.selos.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
      '<p class="prod-preco">' + brl(p.preco) + '</p>' +
      (p.opcoes || []).map((o, oi) => '<fieldset><legend>' + esc(o.nome) + ' <small>' + (o.tipo === 'um' ? 'escolha 1' : 'opcional') + '</small></legend>' + o.escolhas.map((e, ei) => '<label class="op"><input type="' + (o.tipo === 'um' ? 'radio' : 'checkbox') + '" name="o' + oi + '" value="' + ei + '"' + (o.tipo === 'um' && ei === 0 ? ' checked' : '') + '><span>' + esc(e.nome) + '</span><b>' + (e.preco ? '+ ' + brl(e.preco) : '') + '</b></label>').join('') + '</fieldset>').join('') +
      (p.esgotado ? '<p class="esg-t">Esgotado no momento</p>' :
        '<div class="prod-qtd"><span>Quantidade</span><div class="step"><button type="button" data-act="qtd-menos" aria-label="Menos um">−</button><span id="prod-q" aria-live="polite">' + q + '</span><button type="button" data-act="qtd-mais" aria-label="Mais um">+</button></div><strong id="prod-total">' + brl(p.preco * q) + '</strong></div>' +
        '<div class="prod-acao"><button type="submit" class="btn prod-add"><span class="ico-carr">' + ICO.carr + selo(noCarr) + '</span>Adicionar ao carrinho</button><button type="button" class="btn prod-pagar" data-act="pagar-agora">Pagar</button></div>' +
        '') + '</form></section>' +
    (outros.length ? '<section><div class="sec-h"><h2>Mais opções de ' + esc(p.categoria.toLowerCase()) + '</h2><span class="nota">' + outros.length + ' ' + (outros.length === 1 ? 'opção' : 'opções') + '</span></div><div class="grid-r">' + outros.map(cardPrato).join('') + '</div></section>' : '');
}
function atualizarProd(){ const f = $('#f-prod'); if (!f || !$('#prod-total')) return; const p = prod(f.dataset.id), q = S.qtdProd || 1; $('#prod-q').textContent = q; $('#prod-total').textContent = brl(unitario(p, selDoForm(p, '#f-prod')) * q); }
function adicionarDaPagina(irParaCarrinho){
  const f = $('#f-prod'); if (!f) return; const p = prod(f.dataset.id); if (!p || p.esgotado) return;
  colocar(p.id, selDoForm(p, '#f-prod'), S.qtdProd || 1, irParaCarrinho);
}

function totais(){
  const itens = S.cart.map(x => ({ x, p: prod(x.id) })).filter(i => i.p && !i.p.esgotado).map(i => Object.assign(i, { unit: unitario(i.p, i.x.sel), q: i.x.q }));
  const sub = itens.reduce((a, i) => a + i.unit * i.q, 0), tipos = tiposOnline();
  let tipo = S.checkout.tipo; if (!tipos.includes(tipo)) tipo = tipos[0];
  const d = R.delivery || {}, bairro = (d.bairros || []).find(b => b.nome === S.checkout.bairro) || (d.bairros || [])[0];
  const taxa = itens.length && tipo === 'delivery' ? (d.gratisAcimaDe && sub >= d.gratisAcimaDe ? 0 : (bairro ? bairro.taxa : 0)) : 0;
  return { itens, sub, taxa, total: sub + taxa, n: itens.reduce((a, i) => a + i.q, 0), tipo, bairro };
}
const NOME_PAG = { online: 'No site', pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', local: 'No local' };
function blocoResumo(){
  const t = totais(), C = S.checkout, d = R.delivery || {};
  const pags = t.tipo ? ((R.pagamentos || {})[t.tipo] || []) : [];
  if (!pags.includes(C.pag)) C.pag = pags.find(x => x !== 'online') || pags[0] || '';
  const abaixo = t.tipo === 'delivery' && d.pedidoMinimo && t.sub < d.pedidoMinimo, fechado = !podePedir(), semCanal = !t.tipo;
  let form = '';
  if (t.itens.length && !semCanal){
    const online = t.tipo === 'delivery' && C.pag === 'online';
    const quem = online
      ? (S.user ? '<div class="conta"><span>Pagando com a conta de <strong>' + esc(S.user.nome) + '</strong></span><button data-act="sair">Sair</button></div>'
        : '<div class="alerta">Para pagar pelo site, entre na sua conta ou crie uma (leva 1 minuto).</div><button class="chip" data-act="login" style="justify-self:start">Entrar ou criar conta</button>')
      : '<label for="nome">Seu nome</label><input id="nome" placeholder="Como chamar você" value="' + esc(C.nome) + '" autocomplete="name" maxlength="60">' +
        '<label for="tel">WhatsApp com DDD</label><input id="tel" inputmode="tel" placeholder="(15) 99999-0000" value="' + esc(C.tel) + '" autocomplete="tel">' +
        (t.tipo === 'delivery' ? '<label for="cpf">CPF</label><input id="cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14" value="' + esc(C.cpf || '') + '" autocomplete="off"><p class="dica">Para pagar na entrega pedimos o CPF, para proteger o restaurante de pedidos falsos.</p>' : '');
    form = (tiposOnline().length > 1 ? '<label>Como receber</label><div class="tipo">' + tiposOnline().map(x => '<button data-tipo="' + x + '" aria-pressed="' + (t.tipo === x) + '">' + (x === 'delivery' ? 'Entrega' : 'Retirar no local') + '</button>').join('') + '</div>' : '') +
      (t.tipo === 'delivery' ? '<label for="end">Endereço de entrega</label><input id="end" placeholder="Rua e número" value="' + esc(C.end) + '" autocomplete="street-address">' +
        '<input id="compl" placeholder="Complemento ou referência (opcional)" value="' + esc(C.compl) + '" aria-label="Complemento ou referência">' +
        '<label for="bairro">Bairro</label><select id="bairro">' + (d.bairros || []).map(b => '<option value="' + esc(b.nome) + '"' + (t.bairro && b.nome === t.bairro.nome ? ' selected' : '') + '>' + esc(b.nome) + ' · ' + brl(b.taxa) + '</option>').join('') + '</select>' : '<div class="alerta">Retire no restaurante em ' + esc(d.tempoRetirada) + '.</div>') +
      '<label>Pagamento</label><div class="pag" style="grid-template-columns:repeat(' + pags.length + ',1fr)">' + pags.map(o => '<button data-pag="' + o + '" aria-pressed="' + (C.pag === o) + '">' + NOME_PAG[o] + '</button>').join('') + '</div>' +
      (online ? '<p class="dica">Cartão ou Pix, pago agora pelo site. O restaurante recebe o pedido assim que o pagamento é aprovado.</p>' : '') +
      (C.pag === 'dinheiro' ? '<label for="troco">Troco para (opcional)</label><input id="troco" type="number" min="0" placeholder="Ex.: 100" value="' + esc(C.troco) + '">' : '') +
      quem + '<label for="obs">Observações (opcional)</label><input id="obs" placeholder="Ex.: sem cebola, mandar talheres" value="' + esc(C.obs) + '" maxlength="300">' +
      (abaixo ? '<div class="alerta">Pedido mínimo para entrega: ' + brl(d.pedidoMinimo) + '.</div>' : '') + (fechado ? '<div class="alerta">O restaurante está fechado agora. Abre às ' + esc(R.abre) + '.</div>' : '');
  }
  const online = t.tipo === 'delivery' && C.pag === 'online';
  return '<aside class="resumo" aria-label="Seu pedido">' + ICO.carr + '<h2>Seu pedido</h2>' +
    (t.itens.length ? '<div class="itens">' + t.itens.map(i => '<div class="lin"><span>' + i.q + '× ' + esc(i.p.nome) + (nomesSel(i.p, i.x.sel).length ? '<br><small>' + esc(nomesSel(i.p, i.x.sel).join(', ')) + '</small>' : '') + '</span><span>' + brl(i.unit * i.q) + '</span></div>').join('') + '</div>' : '<p class="vz">Seu carrinho está vazio. Toque em + para adicionar.</p>') +
    '<div class="lin" style="border-top:1px solid rgb(255 255 255 / .35);padding-top:10px"><span>Subtotal</span><span>' + brl(t.sub) + '</span></div>' +
    (t.tipo === 'delivery' && t.itens.length ? '<div class="lin"><span>Taxa de entrega' + (d.gratisAcimaDe && t.sub < d.gratisAcimaDe ? '<br><small>grátis acima de ' + brl(d.gratisAcimaDe) + '</small>' : '') + '</span><span>' + (t.taxa ? brl(t.taxa) : 'Grátis') + '</span></div>' : '') +
    '<div class="lin tot"><span>Total</span><span>' + brl(t.total) + '</span></div>' + form +
    (semCanal ? '<div class="alerta">Este restaurante não está recebendo pedidos pelo site agora. Fale com ele pelo WhatsApp.</div>' : '') +
    '<button class="pedir" data-act="pedir" id="pedir"' + (t.itens.length && !abaixo && !fechado && !semCanal ? '' : ' disabled') + '>' + ICO.check + (online ? 'Ir para o pagamento' : 'Pedir agora') + '</button>' +
    (t.itens.length && !online && !semCanal ? '<p class="semcad">Sem cadastro e sem senha. Seu nome e WhatsApp ficam só neste aparelho para o próximo pedido.</p>' : '') + '</aside>';
}
function telaCarrinho(){
  const t = totais();
  if (!t.itens.length) return '<section><div class="sec-h"><h2>Carrinho</h2></div><div class="vazio-g"><strong>Seu carrinho está vazio</strong>Escolha os pratos no cardápio e toque em +.<div style="margin-top:14px"><button class="btn" data-go="cardapio">Ver o cardápio</button></div></div></section>';
  const base = S.ultimo ? prod(S.ultimo.id) : t.itens[t.itens.length - 1].p;
  const mais = base ? P.filter(x => x.categoria === base.categoria && !x.esgotado && !S.cart.some(c => c.id === x.id)).slice(0, 6) : [];
  return (S.ultimo ? '<div class="adicionado" role="status">' + ICO.check + '<span><strong>' + esc(S.ultimo.nome) + '</strong> adicionado ao carrinho</span><button class="chip" data-act="continuar">Continuar comprando</button></div>' : '') +
    '<div class="rpage"><div><div class="sec-h"><h2>Carrinho</h2><button class="ver" data-act="continuar">Adicionar mais itens ' + seta + '</button></div>' +
    t.itens.map(i => '<div class="item">' + foto(i.p.fotoUrl, i.p.nome, 'th', i.p.nome[0]) + '<div style="min-width:0"><h3>' + esc(i.p.nome) + '</h3><p>' + esc(nomesSel(i.p, i.x.sel).join(', ') || i.p.descricao) + '</p></div><div class="lado"><span class="preco">' + brl(i.unit * i.q) + '</span><div class="step"><button data-linha-menos="' + esc(i.x.k) + '" aria-label="Tirar um">−</button><span>' + i.q + '</span><button data-linha-mais="' + esc(i.x.k) + '" aria-label="Adicionar um">+</button></div></div></div>').join('') +
    (mais.length ? '<section class="mais"><div class="sec-h"><h2>Mais opções de ' + esc(base.categoria.toLowerCase()) + '</h2></div><div class="grid-r mini">' + mais.map(cardPrato).join('') + '</div></section>' : '') +
    '</div>' + blocoResumo() + '</div>';
}
const ORDEM = ['novo', 'preparo', 'pronto', 'rota', 'entregue'];
function etapas(p){ return p.tipo === 'delivery' ? [['novo', 'Recebido'], ['preparo', 'Preparando'], ['rota', 'A caminho'], ['entregue', 'Entregue']] : [['novo', 'Recebido'], ['preparo', 'Preparando'], ['pronto', 'Pronto para retirar'], ['entregue', 'Retirado']]; }
const STATUS_TXT = { aguardando: 'Aguardando pagamento', novo: 'Recebido', preparo: 'Preparando', pronto: 'Pronto', rota: 'A caminho', entregue: 'Entregue', cancelado: 'Cancelado' };
function telaPedidos(){
  const meus = S.pedidos.filter(p => p.restaurante && p.restaurante.slug === SLUG);
  if (S.meus.length && !S.pedidosCarregados) return '<p class="carregando">Carregando seus pedidos…</p>';
  if (!meus.length) return '<section><div class="sec-h"><h2>Pedidos</h2></div><div class="vazio-g"><strong>Nenhum pedido neste aparelho</strong>Quando pedir, você acompanha cada etapa por aqui, em tempo real. Não precisa de cadastro.<div style="margin-top:14px"><button class="btn" data-go="cardapio">Ver o cardápio</button></div></div></section>';
  return '<section><div class="sec-h"><h2>Pedidos</h2><span class="nota">Feitos neste aparelho · atualiza sozinho quando o restaurante muda a etapa</span></div><div class="lista-ped">' + meus.map(p => {
    const cur = ORDEM.indexOf(p.status), canc = p.status === 'cancelado', m = S.meus.find(x => x.id === p.id), nota = S.aval[p.id] || 0;
    const pix = p.pagamento.metodo === 'pix' && !p.pagamento.pago && !canc;
    return '<article class="ped"><div class="ped-h"><div><h3>Pedido #' + p.numero + '</h3><small>' + new Date(p.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' + p.linhas.map(x => x.qtd + '× ' + esc(x.nome)).join(', ') + '</small></div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="badge' + (p.status === 'entregue' ? ' ok' : '') + '">' + STATUS_TXT[p.status] + '</span><strong class="preco">' + brl(p.total) + '</strong></div></div>' +
      (p.status === 'aguardando' ? '<div class="pixped"><span>' + (p.pagamento.online === 'recusado' ? 'O pagamento não foi aprovado. Tente de novo ou use outro cartão.' : 'Falta pagar para o restaurante receber o pedido.') + '</span>' + (m ? '<a class="btn" href="/pagar/' + esc(p.id) + '?c=' + encodeURIComponent(m.c) + '">Pagar agora</a>' : '') + '</div>' :
       canc ? '<p style="margin:0;color:var(--muted)">' + (p.pagamento.metodo === 'online' && !p.pagamento.pago ? 'O pagamento não foi concluído a tempo, então o pedido foi cancelado. Nada foi cobrado.' : 'O restaurante cancelou este pedido. Se você já pagou, fale com o restaurante para o estorno.') + '</p>' :
       '<div class="trilha">' + etapas(p).map(e => '<div class="' + (ORDEM.indexOf(e[0]) <= cur ? 'on' : '') + '">' + e[1] + (e[0] === 'rota' && p.entregador && cur >= 3 ? ' com ' + esc(p.entregador.nome) : '') + '</div>').join('') + '</div>') +
      (pix ? '<div class="pixped"><span>Pague ' + brl(p.total) + ' com Pix' + (R.chavePix ? ': <code>' + esc(R.chavePix) + '</code>' : '') + '</span>' + (R.chavePix ? '<button class="chip" data-copiar="' + esc(R.chavePix) + '">Copiar chave</button>' : '') + '</div>' : '') +
      (p.status === 'entregue' && !p.avaliacao ? '<div class="aval"><strong>Como foi o pedido?</strong><div class="es" role="radiogroup" aria-label="Nota">' + [1, 2, 3, 4, 5].map(n => '<button data-nota="' + p.id + ':' + n + '" class="' + (n <= nota ? 'on' : '') + '" role="radio" aria-checked="' + (n === nota) + '" aria-label="' + n + ' estrela' + (n > 1 ? 's' : '') + '"><svg viewBox="0 0 24 24" fill="currentColor">' + STAR + '</svg></button>').join('') + '</div>' +
        '<label for="c-' + p.id + '" style="font-weight:700;font-size:14px">Conte para outros clientes (opcional)</label><textarea id="c-' + p.id + '" maxlength="400" placeholder="O que você achou da comida e da entrega?"></textarea><div><button class="btn" data-avaliar="' + p.id + '">Enviar avaliação</button></div></div>' : '') +
      (p.avaliacao ? '<div style="display:flex;gap:8px;align-items:center;color:var(--muted);font-size:14px">Sua avaliação: ' + estrelas(p.avaliacao.nota) + '</div>' : '') +
      (p.status === 'entregue' ? '<div><button class="chip" data-repetir="' + p.id + '">Pedir de novo</button></div>' : '') + '</article>'; }).join('') + '</div></section>';
}

/* ---------- render ---------- */
let autoplay;
const CHAVES_FOCO = ['add', 'menos', 'pag', 'tipo', 'cat', 'rail', 'act', 'nota', 'linhaMais', 'linhaMenos'];
function render(){
  const app = $('#app');
  const ae = document.activeElement; let foco = null;
  if (ae && app.contains(ae)){ const k = CHAVES_FOCO.find(k => ae.dataset && ae.dataset[k] !== undefined); if (k) foco = '[data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + '="' + CSS.escape(ae.dataset[k]) + '"]' + (k === 'rail' ? '[data-dir="' + ae.dataset.dir + '"]' : ''); else if (ae.id) foco = '#' + CSS.escape(ae.id); }
  app.innerHTML = { home: telaHome, cardapio: telaCardapio, produto: telaProduto, carrinho: telaCarrinho, pedidos: telaPedidos }[S.rota]();
  $$('.nav [data-go], .bnav [data-go]').forEach(b => { if (b.dataset.go === S.rota || (S.rota === 'produto' && b.dataset.go === 'cardapio')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const t = totais(); ['#cnt', '#cnt2'].forEach(s => { $(s).hidden = !t.n; $(s).textContent = t.n; });
  if (S.rota === 'cardapio'){ const o = $('#f-ordem'); if (o) o.value = S.ordem; }
  if (S.rota === 'home'){ irSlide(S.slide, true); iniciarAuto(); } else clearInterval(autoplay);
  $$('.rail').forEach(r => { atualizarSetas(r); r.addEventListener('scroll', () => atualizarSetas(r), { passive: true }); });
  if (foco){ const n = app.querySelector(foco); if (n) n.focus({ preventScroll: true }); }
}
function ir(rota, extra){
  if (rota !== 'carrinho') S.ultimo = null; // a mensagem de "adicionado" só aparece logo depois de adicionar
  if (rota === 'produto' && S.rota !== 'produto' && S.rota !== 'carrinho') S.voltarPara = { rota: S.rota, cat: S.cat, q: S.q };
  Object.assign(S, extra || {}); S.rota = rota;
  if (rota === 'produto') S.qtdProd = 1;
  try { history.replaceState(null, '', '#' + (rota === 'produto' ? 'prato-' + S.pid : rota)); } catch (e) {}
  if (rota === 'pedidos') carregarPedidos();
  render(); window.scrollTo(0, 0);
}
const reduz = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function irSlide(i, semAnimar){ const el = $('#slides'); if (!el || !PROMOS.length) return; S.slide = (i + PROMOS.length) % PROMOS.length; if (semAnimar) el.style.transition = 'none'; el.style.transform = 'translateX(' + (-100 * S.slide) + '%)'; if (semAnimar) requestAnimationFrame(() => { el.style.transition = ''; }); $$('.dots button').forEach((b, k) => b.setAttribute('aria-current', String(k === S.slide))); }
function iniciarAuto(){ clearInterval(autoplay); if (reduz() || PROMOS.length < 2) return; autoplay = setInterval(() => { const h = $('.hero'); if (h && !h.matches(':hover') && !h.contains(document.activeElement)) irSlide(S.slide + 1); }, 5500); }
function atualizarSetas(r){ const b = $$('[data-rail="' + r.id + '"]'); if (!b.length) return; b[0].disabled = r.scrollLeft <= 4; b[1].disabled = r.scrollLeft + r.clientWidth >= r.scrollWidth - 4; }

/* ---------- carrinho e opções ---------- */
const chave = (id, sel) => id + '|' + JSON.stringify(sel || {});
// Coloca no carrinho. "Pagar" leva direto ao carrinho; "Adicionar" fica na página e mostra o aviso.
function colocar(id, sel, q, irParaCarrinho){
  const p = prod(id); if (!p || p.esgotado) return;
  q = Math.max(1, q || 1);
  const k = chave(id, sel), l = S.cart.find(x => x.k === k);
  if (l) l.q += q; else S.cart.push({ k, id, sel: sel || {}, q });
  salvar();
  if (irParaCarrinho){
    if (S.rota !== 'carrinho' && S.rota !== 'produto') S.voltarPara = { rota: S.rota, cat: S.cat, q: S.q };
    return ir('carrinho', { ultimo: { id, nome: p.nome } });
  }
  S.qtdProd = 1; render(); avisoAdicionado(q, p.nome);
}
// O botão + dos cards: prato sem opções entra direto; com opções, abre a página dele para escolher
function adicionar(id){
  const p = prod(id); if (!p) return;
  if (!(p.opcoes || []).length) return colocar(id, {}, 1, false);
  ir('produto', { pid: id });
}
function tirar(id){ const ls = S.cart.filter(x => x.id === id); if (!ls.length) return; const l = ls[ls.length - 1]; l.q--; if (!l.q) S.cart = S.cart.filter(x => x !== l); salvar(); render(); }
function abrirOpcoes(p){
  $('#modal').innerHTML = '<div class="veu" data-fechar><form class="caixa opcoes" id="f-op" data-id="' + p.id + '" role="dialog" aria-modal="true" aria-labelledby="op-t">' + (p.fotoUrl ? '<img class="op-foto" src="' + esc(p.fotoUrl) + '" alt="">' : '') +
    '<h3 id="op-t">' + esc(p.nome) + '</h3><p>' + esc(p.descricao) + '</p>' +
    p.opcoes.map((o, oi) => '<fieldset><legend>' + esc(o.nome) + ' <small>' + (o.tipo === 'um' ? 'escolha 1' : 'opcional') + '</small></legend>' + o.escolhas.map((e, ei) => '<label class="op"><input type="' + (o.tipo === 'um' ? 'radio' : 'checkbox') + '" name="o' + oi + '" value="' + ei + '"' + (o.tipo === 'um' && ei === 0 ? ' checked' : '') + '><span>' + esc(e.nome) + '</span><b>' + (e.preco ? '+ ' + brl(e.preco) : '') + '</b></label>').join('') + '</fieldset>').join('') +
    '<div class="row"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn" id="op-ok">Adicionar · ' + brl(p.preco) + '</button></div></form></div>';
  atualizarOpcoes(); const f = $('#f-op input'); if (f) f.focus();
}
function selDoForm(p, form){ const f = form || '#f-op', sel = {}; (p.opcoes || []).forEach((o, oi) => { const v = $$(f + ' input[name="o' + oi + '"]:checked').map(i => +i.value); if (v.length) sel[oi] = v; }); return sel; }
function atualizarOpcoes(){ const f = $('#f-op'); if (!f) return; const p = prod(f.dataset.id); $('#op-ok').textContent = 'Adicionar · ' + brl(unitario(p, selDoForm(p))); }

/* ---------- pedido ---------- */
let pedirDepoisDoLogin = false;
async function pedir(){
  const t = totais(), C = S.checkout; if (!t.itens.length) return;
  const online = t.tipo === 'delivery' && C.pag === 'online';
  if (online && !S.user){ pedirDepoisDoLogin = true; return abrirLogin('Para pagar pelo site, entre ou crie sua conta. Leva 1 minuto.'); }
  const nome = (C.nome || '').trim(), tel = (C.tel || '').trim(), cpf = (C.cpf || '').replace(/\D/g, '');
  if (!online){
    if (nome.length < 2){ toast('Diga seu nome para o restaurante saber de quem é o pedido.'); const i = $('#nome'); if (i) i.focus(); return; }
    if (tel.replace(/\D/g, '').length < 10){ toast('Informe seu WhatsApp com DDD.'); const i = $('#tel'); if (i) i.focus(); return; }
    if (t.tipo === 'delivery' && !cpfValido(cpf)){ toast(cpf ? 'CPF inválido. Confira os números.' : 'Para pagar na entrega, informe seu CPF.'); const i = $('#cpf'); if (i) i.focus(); return; }
  }
  if (t.tipo === 'delivery' && C.end.trim().length < 4){ toast('Informe a rua e o número para a entrega.'); const i = $('#end'); if (i) i.focus(); return; }
  const btn = $('#pedir'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const d = await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/pedidos', {
      tipo: t.tipo, cliente: online ? undefined : { nome, tel, cpf: t.tipo === 'delivery' ? cpf : undefined },
      entrega: t.tipo === 'delivery' ? { endereco: C.end, complemento: C.compl, bairro: t.bairro && t.bairro.nome } : undefined,
      itens: t.itens.map(i => ({ produto: i.p.id, qtd: i.q, escolhas: i.x.sel })), obs: C.obs, pagamento: { metodo: C.pag, troco: C.pag === 'dinheiro' ? C.troco : 0 } });
    S.meus = [{ id: d.pedido.id, c: d.codigo }].concat(S.meus.filter(x => x.id !== d.pedido.id)).slice(0, 30);
    S.cart = []; C.troco = ''; C.obs = ''; salvar();
    if (d.pagamento && d.pagamento.url){ location.href = d.pagamento.url; return; }
    conectarTempoReal();
    toast('Pedido #' + d.pedido.numero + ' enviado!');
    ir('pedidos');
  } catch (e) {
    toast(e.message); render();
    if (e.status === 409 || e.status === 400 && /produto/i.test(e.message)) recarregarCardapio();
  }
}
async function recarregarCardapio(){ try { await carregar(); render(); } catch (e) {} }

/* ---------- pedidos deste aparelho (sem conta) ---------- */
async function carregarPedidos(){
  if (!S.meus.length){ S.pedidos = []; S.pedidosCarregados = true; if (S.rota === 'pedidos') render(); return; }
  try {
    S.pedidos = (await api('POST', '/api/acompanhar', { pedidos: S.meus.slice(0, 20).map(x => ({ id: x.id, c: x.c })) })).pedidos;
    S.pedidosCarregados = true; if (S.rota === 'pedidos') render();
  } catch (e) { S.pedidosCarregados = true; if (S.rota === 'pedidos') render(); toast(e.message); }
}
function conectarTempoReal(){
  if (S.socket){ S.socket.close(); S.socket = null; }
  if (!S.meus.length || typeof io !== 'function') return;
  S.socket = io({ auth: { pedidos: S.meus.slice(0, 20).map(x => ({ id: x.id, c: x.c })) } });
  S.socket.on('pedido:atualizado', p => {
    const i = S.pedidos.findIndex(x => x.id === p.id);
    if (i >= 0){ const antes = S.pedidos[i].status; S.pedidos[i] = Object.assign({}, S.pedidos[i], p, { restaurante: S.pedidos[i].restaurante, avaliacao: S.pedidos[i].avaliacao }); if (antes !== p.status) toast('Pedido #' + p.numero + ': ' + STATUS_TXT[p.status].toLowerCase()); }
    else carregarPedidos();
    if (S.rota === 'pedidos') render();
  });
}

/* ---------- conta (só para pagar a entrega pelo site) ---------- */
function fechar(){ $('#modal').innerHTML = ''; }
function entrarNaConta(d){
  S.token = d.token; S.user = d.cliente; salvar(); fechar(); render(); toast('Olá, ' + S.user.nome.split(' ')[0] + '!');
  if (pedirDepoisDoLogin){ pedirDepoisDoLogin = false; pedir(); }
}
function sairDaConta(){ S.token = ''; S.user = null; salvar(); }
function abrirLogin(msg, modo){
  const entrar = modo === 'entrar';
  $('#modal').innerHTML = '<div class="veu" data-fechar><form class="login" id="f-login" novalidate role="dialog" aria-modal="true" aria-label="' + (entrar ? 'Entrar' : 'Criar conta') + '" data-modo="' + (entrar ? 'entrar' : 'criar') + '">' + (R.capaUrl ? '<img class="fundo" src="' + esc(R.capaUrl) + '" alt="">' : '') +
    '<button type="button" class="fechar" data-fechar aria-label="Fechar">×</button><div class="logo-login">' + esc(R.nome) + '</div>' + (msg ? '<div class="msg">' + esc(msg) + '</div>' : '') +
    (entrar ? '' : '<input id="l-nome" placeholder="Seu nome" autocomplete="name" aria-label="Nome" maxlength="60"><input id="l-tel" inputmode="tel" placeholder="WhatsApp com DDD" autocomplete="tel" aria-label="WhatsApp com DDD"><input id="l-cpf" inputmode="numeric" placeholder="CPF" maxlength="14" autocomplete="off" aria-label="CPF">') +
    '<input id="l-email" type="email" placeholder="Seu e-mail" autocomplete="email" aria-label="E-mail"><input id="l-senha" type="password" placeholder="' + (entrar ? 'Sua senha' : 'Crie uma senha (mínimo 8)') + '" autocomplete="' + (entrar ? 'current-password' : 'new-password') + '" aria-label="Senha">' +
    '<button class="b1" type="submit" id="l-btn">' + (entrar ? 'Entrar' : 'Criar conta') + '</button>' +
    '<div class="links"><button type="button" class="troca" data-act="' + (entrar ? 'modo-criar' : 'modo-entrar') + '">' + (entrar ? 'Criar conta' : 'Já tenho conta') + '</button>' + (entrar ? '<button type="button" class="troca" data-act="esqueci">Esqueci minha senha</button>' : '') + '</div>' +
    '<div class="msg" id="l-msg" hidden></div></form></div>';
  $(entrar ? '#l-email' : '#l-nome').focus();
}
function esqueciSenha(){
  const m = $('#l-msg'); m.hidden = false;
  m.textContent = 'Fale com o ' + R.nome + (R.whatsapp ? ' pelo WhatsApp ' + R.whatsapp : '') + ' para criar uma senha nova. Você também pode pagar na entrega, sem conta.';
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('button, [data-fechar]'); if (!el) return;
  const d = el.dataset;
  if ('fechar' in d && (e.target === el || el.tagName === 'BUTTON')){ fechar(); return; }
  if (d.go){ ir(d.go); return; }
  if (d.ver){ ir('produto', { pid: d.ver }); return; }
  if (d.add){ adicionar(d.add); return; }
  if (d.menos){ tirar(d.menos); return; }
  if (d.linhaMais){ const l = S.cart.find(x => x.k === d.linhaMais); if (l){ l.q++; salvar(); render(); } return; }
  if (d.linhaMenos){ const l = S.cart.find(x => x.k === d.linhaMenos); if (l){ l.q--; if (!l.q) S.cart = S.cart.filter(x => x !== l); salvar(); render(); } return; }
  if (d.cat !== undefined){ $('#busca').value = ''; ir('cardapio', { cat: d.cat || null, q: '' }); return; }
  if (d.rail){ const r = document.getElementById(d.rail); r.scrollBy({ left: Number(d.dir) * r.clientWidth * 0.85, behavior: reduz() ? 'auto' : 'smooth' }); return; }
  if (d.slide){ irSlide(S.slide + Number(d.slide)); iniciarAuto(); return; }
  if (d.ir){ irSlide(Number(d.ir)); iniciarAuto(); return; }
  if (d.pag){ S.checkout.pag = d.pag; salvar(); render(); return; }
  if (d.tipo){ S.checkout.tipo = d.tipo; salvar(); render(); return; }
  if (d.copiar){ try { await navigator.clipboard.writeText(d.copiar); toast('Chave Pix copiada'); } catch (err) { toast('Selecione e copie a chave'); } return; }
  if (d.nota){ const [id, n] = d.nota.split(':'); S.aval[id] = +n; $$('[data-nota^="' + id + ':"]').forEach(b => { const k = +b.dataset.nota.split(':')[1]; b.classList.toggle('on', k <= +n); b.setAttribute('aria-checked', String(k === +n)); }); return; }
  if (d.avaliar){ const id = d.avaliar; if (!S.aval[id]){ toast('Escolha de 1 a 5 estrelas.'); return; }
    const m = S.meus.find(x => x.id === id); if (!m) return;
    try { await api('POST', '/api/acompanhar/' + id + '/avaliacao', { c: m.c, nota: S.aval[id], comentario: ($('#c-' + id) || {}).value || '' }); toast('Obrigado pela avaliação!'); const p = S.pedidos.find(x => x.id === id); p.avaliacao = { nota: S.aval[id] }; render(); }
    catch (err) { toast(err.message); } return; }
  if (d.repetir){ const p = S.pedidos.find(x => x.id === d.repetir); S.cart = [];
    p.linhas.forEach(l => { const pr = P.find(x => x.nome === l.nome && !x.esgotado); if (!pr) return; const sel = {}; (pr.opcoes || []).forEach((o, oi) => { const v = o.escolhas.map((e, ei) => (l.opcoes || []).includes(e.nome) ? ei : -1).filter(x => x >= 0); if (v.length) sel[oi] = v; }); S.cart.push({ k: chave(pr.id, sel), id: pr.id, sel, q: l.qtd }); });
    salvar(); ir('carrinho'); toast('Itens de volta no carrinho'); return; }
  if (d.sug){ $('#sugest').hidden = true; d.sug === 'cat' ? ir('cardapio', { cat: el.dataset.v, q: '' }) : ir('produto', { pid: d.sug }); return; }
  switch (d.act){
    case 'recarregar': location.reload(); break;
    case 'continuar': case 'voltar': { const v = S.voltarPara || { rota: 'cardapio' }; ir(v.rota === 'produto' || v.rota === 'carrinho' ? 'cardapio' : v.rota, { cat: v.cat || null, q: v.q || '' }); break; }
    case 'pagar-agora': adicionarDaPagina(true); break;
    case 'qtd-mais': S.qtdProd = Math.min(50, (S.qtdProd || 1) + 1); atualizarProd(); break;
    case 'qtd-menos': S.qtdProd = Math.max(1, (S.qtdProd || 1) - 1); atualizarProd(); break;
    case 'limpar-q': S.q = ''; $('#busca').value = ''; render(); break;
    case 'pedir': pedir(); break;
    case 'login': pedirDepoisDoLogin = false; abrirLogin(); break;
    case 'sair': sairDaConta(); render(); toast('Você saiu da conta'); break;
    case 'modo-entrar': abrirLogin('', 'entrar'); break;
    case 'modo-criar': abrirLogin(''); break;
    case 'esqueci': esqueciSenha(); break;
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'f-prod'){ e.preventDefault(); adicionarDaPagina(false); return; }
  if (e.target.id === 'f-op'){ e.preventDefault(); const p = prod(e.target.dataset.id); const sel = selDoForm(p); fechar(); colocar(p.id, sel, 1, false); return; }
  if (e.target.id !== 'f-login') return; e.preventDefault();
  const modo = e.target.dataset.modo, m = $('#l-msg'), b = $('#l-btn');
  const corpo = { email: $('#l-email').value.trim(), senha: $('#l-senha').value };
  if (modo === 'criar'){
    Object.assign(corpo, { nome: $('#l-nome').value.trim(), telefone: $('#l-tel').value.trim(), cpf: $('#l-cpf').value });
    const erro = corpo.nome.length < 2 ? 'Informe seu nome.' : corpo.telefone.replace(/\D/g, '').length < 10 ? 'Informe seu WhatsApp com DDD.' : !cpfValido(corpo.cpf) ? 'CPF inválido. Confira os números.' : '';
    if (erro){ m.hidden = false; m.textContent = erro; return; }
  }
  b.disabled = true; b.textContent = modo === 'criar' ? 'Criando…' : 'Entrando…';
  try { entrarNaConta(await api('POST', '/api/clientes/' + (modo === 'criar' ? 'cadastro' : 'login'), corpo)); }
  catch (err) { m.hidden = false; m.textContent = err.message; b.disabled = false; b.textContent = modo === 'criar' ? 'Criar conta' : 'Entrar'; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ fechar(); $('#sugest').hidden = true; } });
document.addEventListener('input', e => {
  const t = e.target, C = S.checkout;
  if (t.id === 'busca'){ mostrarSugest(t.value); return; }
  if (t.closest && t.closest('#f-op')){ atualizarOpcoes(); return; }
  if (t.closest && t.closest('#f-prod')){ atualizarProd(); return; }
  if (['end', 'compl', 'tel', 'nome'].includes(t.id)){ C[t.id] = t.value; salvar(); return; }
  if (t.id === 'troco' || t.id === 'obs'){ C[t.id] = t.value; return; }
  if (t.id === 'cpf' || t.id === 'l-cpf'){ const v = fmtCpf(t.value); if (v !== t.value) t.value = v; if (t.id === 'cpf') C.cpf = v; return; } // o CPF não fica salvo no aparelho
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.closest && t.closest('#f-op')){ atualizarOpcoes(); return; }
  if (t.closest && t.closest('#f-prod')){ atualizarProd(); return; }
  if (t.id === 'f-ordem'){ S.ordem = t.value; render(); }
  if (t.id === 'bairro'){ S.checkout.bairro = t.value; salvar(); render(); }
});
function mostrarSugest(v){
  const box = $('#sugest'), q = norm(v.trim());
  if (!q){ box.hidden = true; return; }
  const cs = categorias().filter(c => norm(c).includes(q)).slice(0, 2);
  const ps = P.filter(p => norm(p.nome + ' ' + p.descricao).includes(q)).slice(0, 6);
  box.innerHTML = (cs.map(c => '<button data-sug="cat" data-v="' + esc(c) + '"><span class="ph" aria-hidden="true">' + esc(c[0]) + '</span><span><strong>' + esc(c) + '</strong><small>Categoria</small></span></button>').join('') +
    ps.map(p => '<button data-sug="' + p.id + '">' + foto(p.fotoUrl, '', '', p.nome[0]) + '<span><strong>' + esc(p.nome) + '</strong><small>' + esc(p.categoria) + ' · ' + brl(p.preco) + '</small></span></button>').join('')) || '<div class="vazio">Nada encontrado para “' + esc(v) + '”.</div>';
  box.hidden = false;
}
$('#busca').addEventListener('keydown', e => { if (e.key === 'Enter'){ $('#sugest').hidden = true; ir('cardapio', { q: e.target.value.trim(), cat: null }); } });
document.addEventListener('pointerdown', e => { if (!e.target.closest('.busca')) $('#sugest').hidden = true; });

/* ---------- início ---------- */
function corDaMarca(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return;
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  if (.2126 * c[0] + .7152 * c[1] + .0722 * c[2] > .3) return; // cor clara demais para texto branco: mantém o vermelho padrão
  const st = document.documentElement.style; st.setProperty('--red', '#' + m[1]); st.setProperty('--red-deep', 'color-mix(in srgb, #' + m[1] + ' 78%, #000)');
}
async function carregar(){
  const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG));
  R = d.restaurante; P = d.produtos;
  const dest = P.filter(p => p.destaque && p.fotoUrl && !p.esgotado);
  PROMOS = (dest.length ? dest : P.filter(p => p.fotoUrl && !p.esgotado)).slice(0, 5);
  S.cart = ler('loja:' + SLUG + ':cart', []).filter(x => x && x.k && prod(x.id) && !prod(x.id).esgotado);
}
function lerHash(){ const h = location.hash.slice(1); if (['home', 'cardapio', 'carrinho', 'pedidos'].includes(h)) S.rota = h; else if (/^prato-/.test(h) && prod(h.slice(6))){ S.rota = 'produto'; S.pid = h.slice(6); S.qtdProd = 1; } }
window.addEventListener('hashchange', () => { lerHash(); fechar(); if (S.rota === 'pedidos') carregarPedidos(); render(); window.scrollTo(0, 0); });
(async function(){
  try {
    const m = /^\/r\/([a-z0-9-]+)\/?$/.exec(location.pathname);
    SLUG = m ? m[1] : (await api('GET', '/api/site')).slug;
    if (!SLUG){ $('#app').innerHTML = '<div class="vazio-g"><strong>Nenhum restaurante cadastrado ainda</strong>Cadastre o primeiro na área de devs.</div>'; return; }
    await carregar();
  } catch (e) { $('#app').innerHTML = '<div class="vazio-g"><strong>' + (e.status === 404 ? 'Restaurante não encontrado' : 'Não foi possível carregar o cardápio') + '</strong>' + esc(e.message) + '<div style="margin-top:14px"><button class="btn" data-act="recarregar">Tentar de novo</button></div></div>'; return; }
  document.title = R.nome + ' · Cardápio e pedidos';
  $('#marca').textContent = R.nome; $('#rodape').textContent = R.nome + (R.frase ? ' · ' + R.frase : '');
  if (R.logoUrl){ $('#marca-logo').innerHTML = '<img src="' + esc(R.logoUrl) + '" alt="">'; }
  corDaMarca(R.cor);
  lerHash();
  if (S.token){ try { S.user = (await api('GET', '/api/clientes/eu')).cliente; salvar(); } catch (e) {} }
  conectarTempoReal();
  if (S.rota === 'pedidos') carregarPedidos();
  render();
})();
})();

// Foto que não carregar vira o placeholder colorido com a inicial
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.falhou) return;
  img.dataset.falhou = '1';
  const ph = document.createElement('div');
  ph.className = (img.className ? img.className + ' ' : '') + 'ph';
  ph.setAttribute('aria-hidden', 'true');
  ph.textContent = (img.alt || '•').trim()[0] || '•';
  img.replaceWith(ph);
}, true);
