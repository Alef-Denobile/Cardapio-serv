/* ChefOnline: vitrine com vários restaurantes, ligada ao servidor */
(function(){
'use strict';
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCpf = v => { const d = String(v || '').replace(/\D/g, '').slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4'); };
function cpfValido(v){ const d = String(v || '').replace(/\D/g, ''); if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false; for (const n of [9, 10]){ let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); if ((s * 10) % 11 % 10 !== +d[n]) return false; } return true; }
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = v => 'R$ ' + (Number.isInteger(+v) ? v : (+v).toFixed(2).replace('.', ','));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ler = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
function toast(t){ const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2800); }
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
let R = [], PRATOS = [], AVS = [];
const S = { rota: 'home', rid: null, cat: null, q: '', filtroAberto: false, ordem: 'rel', maxPreco: 100, notaMin: 0, soFav: false, slide: 0,
  cart: ler('chef:cart', { rid: null, itens: {} }), favs: ler('chef:favs', []),
  // Sem cadastro: os pedidos feitos neste aparelho ficam guardados aqui (id + código de acompanhamento)
  meus: ler('chef:pedidos', []).filter(x => x && x.id && x.c),
  // Conta de cliente: só para quem paga a entrega pelo site
  token: ler('chef:token', ''), user: ler('chef:user', null),
  checkout: Object.assign({ tipo: 'delivery', pag: 'pix', nome: '', end: '', bairro: '', tel: '', troco: '' }, ler('chef:checkout', {})), pedidos: [], socket: null, voltarPara: 'home', aval: {} };
const salvar = () => { gravar('chef:cart', S.cart); gravar('chef:favs', S.favs); gravar('chef:pedidos', S.meus.slice(0, 20)); gravar('chef:token', S.token || null); gravar('chef:user', S.user || null); gravar('chef:checkout', { tipo: S.checkout.tipo, pag: S.checkout.pag, nome: S.checkout.nome, tel: S.checkout.tel, end: S.checkout.end, bairro: S.checkout.bairro }); };
const rest = id => R.find(r => r.id === id);
const prato = id => PRATOS.find(p => p.id === id);

/* ---------- peças visuais ---------- */
function foto(url, alt, cls, cor, letra){ return url ? '<img class="' + cls + '" src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy">' : '<div class="' + cls + ' ph" style="background:linear-gradient(135deg,' + esc(cor) + ',' + esc(cor) + 'AA)" aria-hidden="true">' + esc(letra) + '</div>'; }
const fotoPrato = (p, cls) => { const r = rest(p.rid); return foto(p.img, p.nome, cls, r.cor, p.nome[0]); };
const STAR = '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"/>';
function estrelas(n, comNumero, aval){
  if (n == null) return '<span class="novo">Novo</span>';
  const k = Math.round(n); let h = '<span class="estrelas" role="img" aria-label="Nota ' + String(n).replace('.', ',') + ' de 5">';
  for (let i = 1; i <= 5; i++) h += '<svg viewBox="0 0 24 24" fill="' + (i <= k ? 'var(--gold)' : 'var(--star-off)') + '" aria-hidden="true">' + STAR + '</svg>';
  return h + (comNumero ? '<span class="nota">' + (+n).toFixed(1).replace('.', ',') + (aval ? ' (' + aval + ')' : '') + '</span>' : '') + '</span>';
}
const coracao = on => '<svg viewBox="0 0 24 24" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-4 5 5 0 0 1 9 4c-2 4.6-9 9-9 9z"/></svg>';
const ICO = {
  mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  moto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h5l3-6h-4l-2-3H8M14 11l-3 6"/></svg>',
  filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  carr: '<svg class="carr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 4h3l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>'
};
const seta = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
function cardPrato(p){
  const r = rest(p.rid);
  return '<article class="card"><button class="card-in" data-abrir="' + r.id + '" aria-label="Ver ' + esc(p.nome) + ' em ' + esc(r.nome) + '">' + fotoPrato(p, 'img') +
    '<div class="bd"><h3>' + esc(p.nome) + '</h3><span class="rest">' + esc(r.nome) + '</span><div class="ft">' + estrelas(r.nota) + '<span class="preco">' + brlCurto(p.preco) + '</span></div></div></button>' +
    '<button class="add-r" data-add="' + p.id + '" aria-label="Adicionar ' + esc(p.nome) + ' ao carrinho">' + ICO.mais + '</button></article>';
}
function cardRest(r){
  const fav = S.favs.includes(r.id);
  return '<article class="card rcard"><button class="card-in" data-abrir="' + r.id + '" aria-label="Abrir ' + esc(r.nome) + '">' + foto(r.img, r.nome, 'img', r.cor, r.nome[0]) +
    '<div class="bd"><h3>' + esc(r.nome) + '</h3><span class="rest">' + esc(r.cat) + (r.aPartirDe != null ? ' · a partir de ' + brlCurto(r.aPartirDe) : '') + '</span><div class="ft">' + estrelas(r.nota, true, r.aval) + '</div>' +
    '<div class="tags"><span>' + ICO.relogio + esc(r.tipos.includes('delivery') ? r.tempo : 'Retirada ' + r.tempoRetirada) + '</span><span>' + ICO.moto + (!r.tipos.includes('delivery') ? 'Só retirada' : r.taxa ? 'a partir de ' + brl(r.taxa) : 'Entrega grátis') + '</span>' + (r.aberto ? '' : '<span>Fechado · abre ' + esc(r.abre) + '</span>') + '</div></div></button>' +
    '<button class="fav" data-fav="' + r.id + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Tirar dos favoritos' : 'Favoritar') + ' ' + esc(r.nome) + '">' + coracao(fav) + '</button>' +
    (r.gratis && r.tipos.includes('delivery') ? '<span class="gratis">Grátis acima de ' + brlCurto(r.gratis) + '</span>' : '') + '</article>';
}
function trilho(id, titulo, conteudo, extra, cls){
  return '<section><div class="sec-h"><h2>' + titulo + '</h2><div class="ctrl">' + (extra || '') + '<button class="seta" data-rail="' + id + '" data-dir="-1" aria-label="Anterior">' + ICO.esq + '</button><button class="seta" data-rail="' + id + '" data-dir="1" aria-label="Próximo">' + ICO.dir + '</button></div></div><div class="rail ' + (cls || '') + '" id="' + id + '">' + conteudo + '</div></section>';
}

/* ---------- dados da vitrine ---------- */
let CATS = [], PROMOS = [];
async function carregarVitrine(){
  const d = await api('GET', '/api/vitrine');
  R = d.restaurantes.map(r => ({ id: r.slug, nome: r.nome, cat: r.categoria, img: r.capaUrl, cor: r.cor, nota: r.nota, aval: r.avaliacoes, tempo: r.tempo, tempoRetirada: r.tempoRetirada,
    taxa: r.taxaMin, gratis: r.gratisAcimaDe, minimo: r.pedidoMinimo, sobre: r.sobre, tipos: r.tipos, pagamentos: r.pagamentos, bairros: r.bairros, aberto: r.aberto, abre: r.abre, aPartirDe: r.aPartirDe, chavePix: r.chavePix, categorias: r.categorias, pratos: [] }));
  PRATOS = d.pratos.filter(p => rest(p.slug)).map(p => ({ id: p.id, rid: p.slug, nome: p.nome, desc: p.descricao, preco: p.preco, img: p.fotoUrl, cat: p.categoria, destaque: p.destaque }));
  PRATOS.forEach(p => rest(p.rid).pratos.push(p));
  AVS = d.avaliacoes.filter(a => rest(a.slug));
  CATS = [...new Set(R.map(r => r.cat))];
  const dest = PRATOS.filter(p => p.destaque && p.img);
  PROMOS = (dest.length ? dest : PRATOS.filter(p => p.img)).slice(0, 4).map(p => ({ img: p.img, eyebrow: 'Destaque · ' + rest(p.rid).nome, titulo: p.nome, sub: p.desc, preco: p.preco, prato: p.id }));
  S.maxPreco = Math.max(20, Math.ceil(Math.max(0, ...PRATOS.map(p => p.preco)) / 10) * 10);
  // carrinho salvo de um restaurante que saiu da vitrine ou de produtos que acabaram
  if (S.cart.rid && !rest(S.cart.rid)) S.cart = { rid: null, itens: {} };
  Object.keys(S.cart.itens).forEach(id => { if (!prato(id)) delete S.cart.itens[id]; });
}

/* ---------- telas ---------- */
function telaHome(){
  if (!R.length) return '<div class="vazio-g"><strong>Nenhum restaurante disponível agora</strong>Volte daqui a pouco.</div>';
  const slides = PROMOS.map((s, i) => '<div class="slide" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' de ' + PROMOS.length + '"><div class="foto"><img src="' + esc(s.img) + '" alt=""></div>' +
    '<div class="selo" aria-hidden="true"><div><small>Por</small><strong>' + brlCurto(s.preco) + '</strong></div></div>' +
    '<div class="txt"><span class="eyebrow">' + esc(s.eyebrow) + '</span><h3>' + esc(s.titulo) + '</h3><p>' + esc(s.sub) + '</p><button class="cta" data-add="' + s.prato + '">Eu quero!</button></div></div>').join('');
  const sugest = (PRATOS.filter(p => p.destaque).length >= 4 ? PRATOS.filter(p => p.destaque) : PRATOS).slice().sort((a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0)).slice(0, 10);
  return (PROMOS.length ? '<section class="hero" aria-roledescription="carrossel" aria-label="Promoções"><div class="slides" id="slides">' + slides + '</div>' +
      (PROMOS.length > 1 ? '<button class="seta ant" data-slide="-1" aria-label="Promoção anterior">' + ICO.esq + '</button><button class="seta prox" data-slide="1" aria-label="Próxima promoção">' + ICO.dir + '</button><div class="dots">' + PROMOS.map((s, i) => '<button data-ir="' + i + '" aria-label="Ir para a promoção ' + (i + 1) + '"></button>').join('') + '</div>' : '') + '</section>' : '') +
    trilho('r-cats', 'O que você está procurando', CATS.map(c => { const r = R.find(x => x.cat === c); return '<button class="cat" data-cat="' + esc(c) + '" aria-pressed="false"><span class="ci">' + foto(r.img, c, '', r.cor, c[0]) + '</span>' + esc(c) + '</button>'; }).join(''), '', 'cats') +
    trilho('r-chef', 'Sugestão do chef', sugest.map(cardPrato).join(''), '<button class="ver" data-go="cardapio">Ver todas ' + seta + '</button>') +
    '<section><div class="sec-h"><h2>Restaurantes perto de você</h2><button class="ver" data-go="cardapio">Ver cardápio completo ' + seta + '</button></div><div class="grid-r">' + R.map(cardRest).join('') + '</div></section>' +
    (AVS.length ? trilho('r-recs', 'Os clientes recomendam', AVS.map(a => '<figure class="rec" style="margin:0 0 14px"><div class="av" aria-hidden="true">' + esc(a.nome.split(' ').map(w => w[0]).join('').slice(0, 2)) + '</div><div><h3>' + esc(a.nome) + ' recomenda:</h3><blockquote style="margin:0"><p>' + esc(a.comentario) + '</p></blockquote><div style="display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap">' + estrelas(a.nota) + '<button class="chip" style="padding:3px 10px;font-size:12.5px" data-abrir="' + a.slug + '">' + esc(rest(a.slug).nome) + '</button></div></div></figure>').join(''), '', 'recs') : '');
}
function filtrados(){
  const q = norm(S.q);
  let l = PRATOS.filter(p => { const r = rest(p.rid); return (!S.cat || r.cat === S.cat) && (!q || norm(p.nome + ' ' + p.desc + ' ' + r.nome + ' ' + r.cat).includes(q)) && p.preco <= S.maxPreco && (r.nota || 0) >= S.notaMin && (!S.soFav || S.favs.includes(r.id)); });
  if (S.ordem === 'preco') l.sort((a, b) => a.preco - b.preco);
  if (S.ordem === 'nota') l.sort((a, b) => (rest(b.rid).nota || 0) - (rest(a.rid).nota || 0));
  if (S.ordem === 'tempo') l.sort((a, b) => parseInt(rest(a.rid).tempo) - parseInt(rest(b.rid).tempo));
  return l;
}
function telaCardapio(){
  const l = filtrados(), teto = Math.max(20, Math.ceil(Math.max(0, ...PRATOS.map(p => p.preco)) / 10) * 10);
  return '<section><div class="sec-h"><h2>' + (S.q ? 'Resultados para “' + esc(S.q) + '”' : S.cat ? esc(S.cat) : 'Cardápio completo') + '</h2><span class="nota">' + l.length + ' pratos</span></div>' +
    '<div class="barra-f"><button class="chip" data-act="filtro" aria-pressed="' + S.filtroAberto + '" aria-expanded="' + S.filtroAberto + '">' + ICO.filtro + 'Filtro</button><button class="chip" data-cat="" aria-pressed="' + (!S.cat) + '">Todos</button>' +
      CATS.map(c => '<button class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (S.cat === c) + '">' + esc(c) + '</button>').join('') + (S.q ? '<button class="chip" data-act="limpar-q">Limpar busca ×</button>' : '') + '</div>' +
    (S.filtroAberto ? '<div class="painel-f"><div><label for="f-ordem">Ordenar por</label><select id="f-ordem"><option value="rel">Mais relevantes</option><option value="preco">Menor preço</option><option value="nota">Melhor avaliados</option><option value="tempo">Entrega mais rápida</option></select></div>' +
      '<div><label for="f-preco">Preço até <span id="f-preco-v">' + brlCurto(S.maxPreco) + '</span></label><input id="f-preco" type="range" min="10" max="' + teto + '" step="5" value="' + S.maxPreco + '"></div>' +
      '<div><label for="f-nota">Nota mínima do restaurante</label><select id="f-nota"><option value="0">Qualquer nota</option><option value="4">4 estrelas ou mais</option><option value="4.5">4,5 estrelas ou mais</option></select></div>' +
      '<div><label>Restaurantes</label><label class="ck" for="f-fav" style="text-transform:none;letter-spacing:0;color:var(--ink);font-size:15px"><input type="checkbox" id="f-fav"' + (S.soFav ? ' checked' : '') + '> Só os meus favoritos</label></div></div>' : '') +
    (l.length ? '<div class="grid-r">' + l.map(cardPrato).join('') + '</div>' : '<div class="vazio-g"><strong>Nenhum prato encontrado</strong>Tente outra palavra, outra categoria ou afrouxe o filtro.</div>') + '</section>';
}
function totais(){
  const r = S.cart.rid ? rest(S.cart.rid) : null;
  const itens = Object.entries(S.cart.itens).filter(x => x[1] > 0).map(([id, q]) => ({ p: prato(id), q })).filter(x => x.p);
  const sub = itens.reduce((a, x) => a + x.p.preco * x.q, 0);
  let tipo = S.checkout.tipo; if (r && !r.tipos.includes(tipo)) tipo = r.tipos[0];
  const bairro = r ? (r.bairros.find(b => b.nome === S.checkout.bairro) || r.bairros[0]) : null;
  const taxa = r && itens.length && tipo === 'delivery' ? (r.gratis && sub >= r.gratis ? 0 : (bairro ? bairro.taxa : 0)) : 0;
  return { r, itens, sub, taxa, total: sub + taxa, n: itens.reduce((a, x) => a + x.q, 0), tipo, bairro };
}
const NOME_PAG = { online: 'Pagar no site', pix: 'Pix', cartao: 'Cartão na entrega', dinheiro: 'Dinheiro', local: 'Pagar na retirada' };
const ROTULO_PAG = { online: 'No site', pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', local: 'No local' };
function blocoResumo(){
  const t = totais(), r = t.r, C = S.checkout;
  const pags = r ? (r.pagamentos[t.tipo] || []) : [];
  if (r && !pags.includes(C.pag)) C.pag = pags[0];
  const abaixo = r && t.tipo === 'delivery' && r.minimo && t.sub < r.minimo;
  const fechado = r && !r.aberto;
  let form = '';
  if (t.itens.length){
    const online = t.tipo === 'delivery' && C.pag === 'online';
    const quem = online
      ? (S.user ? '<div class="conta"><span>Pagando com a conta de <strong>' + esc(S.user.nome) + '</strong></span><button data-act="sair">Sair</button></div>'
        : '<div class="alerta">Para pagar pelo site, entre na sua conta ou crie uma (leva 1 minuto).</div><button class="chip" data-act="login" style="justify-self:start">Entrar ou criar conta</button>')
      : '<label for="nome">Seu nome</label><input id="nome" placeholder="Como chamar você" value="' + esc(C.nome) + '" autocomplete="name" maxlength="60">' +
        '<label for="tel">WhatsApp com DDD</label><input id="tel" inputmode="tel" placeholder="(15) 99999-0000" value="' + esc(C.tel) + '" autocomplete="tel">' +
        (t.tipo === 'delivery' ? '<label for="cpf">CPF</label><input id="cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14" value="' + esc(C.cpf || '') + '" autocomplete="off"><p class="dica">Para pagar na entrega pedimos o CPF, para proteger o restaurante de pedidos falsos.</p>' : '');
    form = (r.tipos.length > 1 ? '<label>Como receber</label><div class="tipo">' + r.tipos.map(x => '<button data-tipo="' + x + '" aria-pressed="' + (t.tipo === x) + '">' + (x === 'delivery' ? 'Entrega' : 'Retirar no local') + '</button>').join('') + '</div>' : '') +
      (t.tipo === 'delivery' ? '<label for="end">Endereço de entrega</label><input id="end" placeholder="Rua e número" value="' + esc(C.end) + '" autocomplete="street-address">' +
        '<label for="bairro">Bairro</label><select id="bairro">' + r.bairros.map(b => '<option value="' + esc(b.nome) + '"' + (t.bairro && b.nome === t.bairro.nome ? ' selected' : '') + '>' + esc(b.nome) + ' · ' + brl(b.taxa) + '</option>').join('') + '</select>' : '<div class="alerta">Retire no restaurante em ' + esc(r.tempoRetirada) + '.</div>') +
      '<label>Pagamento</label><div class="pag" style="grid-template-columns:repeat(' + pags.length + ',1fr)">' + pags.map(o => '<button data-pag="' + o + '" aria-pressed="' + (C.pag === o) + '">' + ROTULO_PAG[o] + '</button>').join('') + '</div>' +
      (online ? '<p class="dica">Cartão ou Pix, pago agora pelo site. O restaurante recebe o pedido assim que o pagamento é aprovado.</p>' : '') +
      (C.pag === 'dinheiro' ? '<label for="troco">Troco para (opcional)</label><input id="troco" type="number" min="0" placeholder="Ex.: 100" value="' + esc(C.troco) + '">' : '') +
      quem +
      (abaixo ? '<div class="alerta">Pedido mínimo para entrega: ' + brl(r.minimo) + '.</div>' : '') + (fechado ? '<div class="alerta">O restaurante está fechado agora. Abre às ' + esc(r.abre) + '.</div>' : '');
  }
  return '<aside class="resumo" aria-label="Seu pedido">' + ICO.carr + '<h2>Finalizar compra</h2>' +
    (t.itens.length ? '<div class="itens">' + t.itens.map(x => '<div class="lin"><span>' + x.q + '× ' + esc(x.p.nome) + '</span><span>' + brl(x.p.preco * x.q) + '</span></div>').join('') + '</div>' : '<p class="vz">Seu carrinho está vazio. Toque em + para adicionar.</p>') +
    '<div class="lin" style="border-top:1px solid rgb(255 255 255 / .35);padding-top:10px"><span>Subtotal</span><span>' + brl(t.sub) + '</span></div>' +
    (t.tipo === 'delivery' || !t.itens.length ? '<div class="lin"><span>Taxa de entrega' + (r && r.gratis && t.sub < r.gratis && t.itens.length ? '<br><small>grátis acima de ' + brl(r.gratis) + '</small>' : '') + '</span><span>' + (t.itens.length && !t.taxa ? 'Grátis' : brl(t.taxa)) + '</span></div>' : '') +
    '<div class="lin tot"><span>Total</span><span>' + brl(t.total) + '</span></div>' + form +
    '<button class="pedir" data-act="pedir" id="pedir"' + (t.itens.length && !abaixo && !fechado ? '' : ' disabled') + '>' + ICO.check + (t.tipo === 'delivery' && C.pag === 'online' ? 'Ir para o pagamento' : 'Pedir agora') + '</button>' +
    (t.itens.length && !(t.tipo === 'delivery' && C.pag === 'online') ? '<p class="semcad">Sem cadastro e sem senha. Seu nome e WhatsApp ficam só neste aparelho para o próximo pedido.</p>' : '') + '</aside>';
}
function telaRest(){
  const r = rest(S.rid); if (!r) return '<div class="vazio-g"><strong>Restaurante não encontrado</strong>Ele pode ter saído da vitrine.<div style="margin-top:14px"><button class="btn" data-go="home">Voltar ao início</button></div></div>';
  const fav = S.favs.includes(r.id);
  const grupos = r.categorias.concat([...new Set(r.pratos.map(p => p.cat))].filter(c => !r.categorias.includes(c))).filter(c => r.pratos.some(p => p.cat === c));
  return '<div class="banner">' + foto(r.img, r.nome, '', r.cor, r.nome[0]) + '<button class="bt voltar" data-act="voltar">' + ICO.esq + 'Voltar</button><button class="bt favb" data-fav="' + r.id + '" aria-pressed="' + fav + '">' + coracao(fav) + (fav ? 'Favorito' : 'Favoritar') + '</button></div>' +
    '<div class="rpage"><div><div class="rinfo"><div><h1>' + esc(r.nome) + '</h1>' + (r.aPartirDe != null ? '<div class="apartir">A partir de ' + brl(r.aPartirDe) + '</div>' : '') + '</div>' + estrelas(r.nota) + '</div>' +
    (r.sobre ? '<p class="sobre">Sobre o local: ' + esc(r.sobre) + '</p>' : '') + '<div class="metas">' + (r.tipos.includes('delivery') ? '<span class="meta">' + ICO.relogio + esc(r.tempo) + '</span><span class="meta">' + ICO.moto + 'Entrega a partir de ' + brl(r.taxa) + (r.gratis ? ' · grátis acima de ' + brl(r.gratis) : '') + '</span>' : '<span class="meta">' + ICO.relogio + 'Retirada em ' + esc(r.tempoRetirada) + '</span>') +
    '<span class="meta">' + (r.nota != null ? r.nota.toFixed(1).replace('.', ',') + ' · ' + r.aval + ' avaliações' : 'Novo no ChefOnline') + '</span>' + (r.aberto ? '' : '<span class="meta">Fechado · abre às ' + esc(r.abre) + '</span>') + '</div>' +
    grupos.map(g => '<h2 class="menu-h">' + esc(g) + '</h2>' + r.pratos.filter(p => p.cat === g).map(p => { const q = S.cart.rid === r.id ? (S.cart.itens[p.id] || 0) : 0;
      return '<div class="item">' + fotoPrato(p, 'th') + '<div style="min-width:0"><h3>' + esc(p.nome) + '</h3><p>' + esc(p.desc) + '</p></div><div class="lado"><span class="preco">' + brlCurto(p.preco) + '</span><div class="step"><button data-menos="' + p.id + '" aria-label="Tirar um ' + esc(p.nome) + '">−</button><span aria-live="polite">' + q + '</span><button data-add="' + p.id + '" aria-label="Adicionar um ' + esc(p.nome) + '">+</button></div></div></div>'; }).join('')).join('') +
    '</div>' + blocoResumo() + '</div>';
}
function telaCarrinho(){
  const t = totais();
  if (!t.itens.length) return '<section><div class="sec-h"><h2>Carrinho</h2></div><div class="vazio-g"><strong>Seu carrinho está vazio</strong>Escolha um restaurante e toque em + nos pratos.<div style="margin-top:14px"><button class="btn" data-go="cardapio">Ver o cardápio</button></div></div></section>';
  return '<section><div class="sec-h"><h2>Carrinho · ' + esc(t.r.nome) + '</h2><button class="ver" data-abrir="' + t.r.id + '">Adicionar mais itens ' + seta + '</button></div><div class="rpage" style="margin-top:0"><div>' +
    t.itens.map(x => '<div class="item">' + fotoPrato(x.p, 'th') + '<div style="min-width:0"><h3>' + esc(x.p.nome) + '</h3><p>' + esc(x.p.desc) + '</p></div><div class="lado"><span class="preco">' + brl(x.p.preco * x.q) + '</span><div class="step"><button data-menos="' + x.p.id + '" aria-label="Tirar um">−</button><span>' + x.q + '</span><button data-add="' + x.p.id + '" aria-label="Adicionar um">+</button></div></div></div>').join('') +
    '</div>' + blocoResumo() + '</div></section>';
}
const ORDEM = ['novo', 'preparo', 'pronto', 'rota', 'entregue'];
function etapas(p){ return p.tipo === 'delivery' ? [['novo', 'Recebido'], ['preparo', 'Preparando'], ['rota', 'A caminho'], ['entregue', 'Entregue']] : [['novo', 'Recebido'], ['preparo', 'Preparando'], ['pronto', 'Pronto para retirar'], ['entregue', 'Retirado']]; }
const STATUS_TXT = { aguardando: 'Aguardando pagamento', novo: 'Recebido', preparo: 'Preparando', pronto: 'Pronto', rota: 'A caminho', entregue: 'Entregue', cancelado: 'Cancelado' };
function telaPedidos(){
  if (S.meus.length && !S.pedidosCarregados) return '<p class="carregando">Carregando seus pedidos…</p>';
  if (!S.pedidos.length) return '<section><div class="sec-h"><h2>Pedidos</h2></div><div class="vazio-g"><strong>Nenhum pedido neste aparelho</strong>Quando pedir, você acompanha cada etapa por aqui, em tempo real. Não precisa de cadastro.<div style="margin-top:14px"><button class="btn" data-go="home">Escolher um prato</button></div></div></section>';
  return '<section><div class="sec-h"><h2>Pedidos</h2><span class="nota">Feitos neste aparelho · atualiza sozinho quando o restaurante muda a etapa</span></div><div class="lista-ped">' + S.pedidos.map(p => {
    const cur = ORDEM.indexOf(p.status), canc = p.status === 'cancelado', r = rest(p.restaurante.slug);
    const pix = p.pagamento.metodo === 'pix' && !p.pagamento.pago && !canc;
    const nota = S.aval[p.id] || 0, m = S.meus.find(x => x.id === p.id);
    return '<article class="ped"><div class="ped-h"><div><h3>#' + p.numero + ' · ' + esc(p.restaurante.nome) + '</h3><small>' + new Date(p.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' + p.linhas.map(x => x.qtd + '× ' + esc(x.nome)).join(', ') + '</small></div>' +
      '<div style="display:flex;gap:10px;align-items:center"><span class="badge' + (p.status === 'entregue' ? ' ok' : '') + '">' + STATUS_TXT[p.status] + '</span><strong class="preco">' + brl(p.total) + '</strong></div></div>' +
      (p.status === 'aguardando' ? '<div class="pixped"><span>' + (p.pagamento.online === 'recusado' ? 'O pagamento não foi aprovado. Tente de novo ou use outro cartão.' : 'Falta pagar para o restaurante receber o pedido.') + '</span>' + (m ? '<a class="btn" href="/pagar/' + esc(p.id) + '?c=' + encodeURIComponent(m.c) + '">Pagar agora</a>' : '') + '</div>' :
      canc ? '<p style="margin:0;color:var(--muted)">' + (p.pagamento.metodo === 'online' && !p.pagamento.pago ? 'O pagamento não foi concluído a tempo, então o pedido foi cancelado. Nada foi cobrado.' : 'O restaurante cancelou este pedido. Se você já pagou, fale com o restaurante para o estorno.') + '</p>' : '<div class="trilha">' + etapas(p).map(e => '<div class="' + (ORDEM.indexOf(e[0]) <= cur ? 'on' : '') + '">' + e[1] + (e[0] === 'rota' && p.entregador && cur >= 3 ? ' com ' + esc(p.entregador.nome) : '') + '</div>').join('') + '</div>') +
      (pix ? '<div class="pixped"><span>Pague ' + brl(p.total) + ' com Pix' + (r && r.chavePix ? ': <code>' + esc(r.chavePix) + '</code>' : '') + '</span>' + (r && r.chavePix ? '<button class="chip" data-copiar="' + esc(r.chavePix) + '">Copiar chave</button>' : '') + '</div>' : '') +
      (p.status === 'entregue' && !p.avaliacao ? '<div class="aval"><strong>Como foi o pedido?</strong><div class="es" role="radiogroup" aria-label="Nota">' + [1, 2, 3, 4, 5].map(n => '<button data-nota="' + p.id + ':' + n + '" class="' + (n <= nota ? 'on' : '') + '" role="radio" aria-checked="' + (n === nota) + '" aria-label="' + n + ' estrela' + (n > 1 ? 's' : '') + '"><svg viewBox="0 0 24 24" fill="currentColor">' + STAR + '</svg></button>').join('') + '</div>' +
        '<label for="c-' + p.id + '" style="font-weight:700;font-size:14px">Conte para outros clientes (opcional)</label><textarea id="c-' + p.id + '" maxlength="400" placeholder="O que você achou da comida e da entrega?"></textarea><div><button class="btn" data-avaliar="' + p.id + '">Enviar avaliação</button></div></div>' : '') +
      (p.avaliacao ? '<div style="display:flex;gap:8px;align-items:center;color:var(--muted);font-size:14px">Sua avaliação: ' + estrelas(p.avaliacao.nota) + '</div>' : '') +
      (p.status === 'entregue' && r ? '<div><button class="chip" data-repetir="' + p.id + '">Pedir de novo</button></div>' : '') + '</article>'; }).join('') + '</div></section>';
}

/* ---------- render ---------- */
let autoplay;
const CHAVES_FOCO = ['add', 'menos', 'fav', 'pag', 'tipo', 'cat', 'rail', 'act', 'nota'];
function render(){
  const app = $('#app');
  const ae = document.activeElement; let foco = null;
  if (ae && app.contains(ae)){ const k = CHAVES_FOCO.find(k => ae.dataset && ae.dataset[k] !== undefined); if (k) foco = '[data-' + k + '="' + CSS.escape(ae.dataset[k]) + '"]' + (k === 'rail' ? '[data-dir="' + ae.dataset.dir + '"]' : ''); else if (ae.id) foco = '#' + CSS.escape(ae.id); }
  app.innerHTML = { home: telaHome, cardapio: telaCardapio, rest: telaRest, carrinho: telaCarrinho, pedidos: telaPedidos }[S.rota]();
  $$('.nav [data-go], .bnav [data-go]').forEach(b => { const on = b.dataset.go === S.rota || (S.rota === 'rest' && b.dataset.go === 'cardapio'); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const t = totais(); ['#cnt', '#cnt2'].forEach(s => { $(s).hidden = !t.n; $(s).textContent = t.n; });
  if (S.rota === 'cardapio' && S.filtroAberto){ $('#f-ordem').value = S.ordem; $('#f-nota').value = String(S.notaMin); }
  if (S.rota === 'home'){ irSlide(S.slide, true); iniciarAuto(); } else clearInterval(autoplay);
  $$('.rail').forEach(r => { atualizarSetas(r); r.addEventListener('scroll', () => atualizarSetas(r), { passive: true }); });
  if (foco){ const n = app.querySelector(foco); if (n) n.focus({ preventScroll: true }); }
}
function ir(rota, extra){
  if (rota === 'rest' && S.rota !== 'rest') S.voltarPara = S.rota;
  Object.assign(S, extra || {}); S.rota = rota;
  try { history.replaceState(null, '', '#' + (rota === 'rest' ? S.rid : rota)); } catch (e) {}
  if (rota === 'pedidos') carregarPedidos();
  render(); window.scrollTo(0, 0);
}
const reduz = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function irSlide(i, semAnimar){ const el = $('#slides'); if (!el || !PROMOS.length) return; S.slide = (i + PROMOS.length) % PROMOS.length; if (semAnimar) el.style.transition = 'none'; el.style.transform = 'translateX(' + (-100 * S.slide) + '%)'; if (semAnimar) requestAnimationFrame(() => { el.style.transition = ''; }); $$('.dots button').forEach((b, k) => b.setAttribute('aria-current', String(k === S.slide))); }
function iniciarAuto(){ clearInterval(autoplay); if (reduz() || PROMOS.length < 2) return; autoplay = setInterval(() => { const h = $('.hero'); if (h && !h.matches(':hover') && !h.contains(document.activeElement)) irSlide(S.slide + 1); }, 5500); }
function atualizarSetas(r){ const b = $$('[data-rail="' + r.id + '"]'); if (!b.length) return; b[0].disabled = r.scrollLeft <= 4; b[1].disabled = r.scrollLeft + r.clientWidth >= r.scrollWidth - 4; }

/* ---------- carrinho e pedido ---------- */
function adicionar(id){
  const p = prato(id); if (!p) return;
  if (S.cart.rid && S.cart.rid !== p.rid && totais().n){
    $('#modal').innerHTML = '<div class="veu" data-fechar><div class="caixa" role="dialog" aria-modal="true" aria-labelledby="tr-t"><h3 id="tr-t">Trocar de restaurante?</h3><p>Seu carrinho tem itens de <strong>' + esc(rest(S.cart.rid).nome) + '</strong>. Cada pedido é de um restaurante só. Quer esvaziar o carrinho e adicionar ' + esc(p.nome) + '?</p><div class="row"><button class="btn sec" data-fechar>Manter carrinho</button><button class="btn" data-trocar="' + id + '">Esvaziar e adicionar</button></div></div></div>';
    $('#modal [data-trocar]').focus(); return;
  }
  S.cart.rid = p.rid; S.cart.itens[id] = (S.cart.itens[id] || 0) + 1; salvar(); toast(p.nome + ' no carrinho'); render();
}
function tirar(id){ if (!S.cart.itens[id]) return; S.cart.itens[id]--; if (!S.cart.itens[id]) delete S.cart.itens[id]; if (!Object.keys(S.cart.itens).length) S.cart.rid = null; salvar(); render(); }
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
    const d = await api('POST', '/api/r/' + encodeURIComponent(t.r.id) + '/pedidos', {
      tipo: t.tipo, cliente: online ? undefined : { nome, tel, cpf: t.tipo === 'delivery' ? cpf : undefined }, entrega: t.tipo === 'delivery' ? { endereco: C.end, bairro: t.bairro && t.bairro.nome } : undefined,
      itens: t.itens.map(x => ({ produto: x.p.id, qtd: x.q })), pagamento: { metodo: C.pag, troco: C.pag === 'dinheiro' ? C.troco : 0 } });
    S.meus = [{ id: d.pedido.id, c: d.codigo }].concat(S.meus.filter(x => x.id !== d.pedido.id)).slice(0, 20);
    S.cart = { rid: null, itens: {} }; C.troco = ''; salvar();
    if (d.pagamento && d.pagamento.url){ location.href = d.pagamento.url; return; }
    conectarTempoReal();
    toast('Pedido #' + d.pedido.numero + ' enviado para ' + t.r.nome);
    ir('pedidos');
  } catch (e) {
    toast(e.message); render();
    if (e.status === 409 || e.status === 400 && /produto/i.test(e.message)) atualizarVitrine();
  }
}
async function atualizarVitrine(){ try { await carregarVitrine(); render(); } catch (e) {} }

/* ---------- pedidos deste aparelho (sem conta) ---------- */
async function carregarPedidos(){
  if (!S.meus.length){ S.pedidos = []; S.pedidosCarregados = true; if (S.rota === 'pedidos') render(); return; }
  try {
    S.pedidos = (await api('POST', '/api/acompanhar', { pedidos: S.meus.map(x => ({ id: x.id, c: x.c })) })).pedidos;
    // esquece pedidos que o servidor não reconhece mais
    const ok = new Set(S.pedidos.map(p => p.id)); if (S.meus.some(x => !ok.has(x.id))){ S.meus = S.meus.filter(x => ok.has(x.id)); salvar(); }
    S.pedidosCarregados = true; if (S.rota === 'pedidos') render();
  } catch (e) { S.pedidosCarregados = true; if (S.rota === 'pedidos') render(); toast(e.message); }
}
function conectarTempoReal(){
  if (S.socket){ S.socket.close(); S.socket = null; }
  if (!S.meus.length || typeof io !== 'function') return;
  S.socket = io({ auth: { pedidos: S.meus.map(x => ({ id: x.id, c: x.c })) } });
  S.socket.on('pedido:atualizado', p => {
    const i = S.pedidos.findIndex(x => x.id === p.id);
    if (i >= 0){ const antes = S.pedidos[i].status; S.pedidos[i] = Object.assign({}, S.pedidos[i], p, { restaurante: S.pedidos[i].restaurante, avaliacao: S.pedidos[i].avaliacao }); if (antes !== p.status) toast('Pedido #' + p.numero + ': ' + STATUS_TXT[p.status].toLowerCase()); }
    else carregarPedidos();
    if (S.rota === 'pedidos') render();
  });
}
function fechar(){ $('#modal').innerHTML = ''; }
function entrarNaConta(d){
  S.token = d.token; S.user = d.cliente; salvar(); fechar(); render(); toast('Olá, ' + S.user.nome.split(' ')[0] + '!');
  if (pedirDepoisDoLogin){ pedirDepoisDoLogin = false; pedir(); }
}
function sairDaConta(){ S.token = ''; S.user = null; salvar(); }
function abrirLogin(msg, modo){
  const entrar = modo === 'entrar';
  $('#modal').innerHTML = '<div class="veu" data-fechar><form class="login" id="f-login" novalidate role="dialog" aria-modal="true" aria-label="' + (entrar ? 'Entrar' : 'Criar conta') + ' no ChefOnline" data-modo="' + (entrar ? 'entrar' : 'criar') + '"><img class="fundo" src="/img/chef/queijos.jpg" alt="">' +
    '<button type="button" class="fechar" data-fechar aria-label="Fechar">×</button><div class="logo" aria-hidden="true">' + $('.logo svg').outerHTML + '<b>Chef</b><i>Online</i></div>' + (msg ? '<div class="msg">' + esc(msg) + '</div>' : '') +
    (entrar ? '' : '<input id="l-nome" placeholder="Seu nome" autocomplete="name" aria-label="Nome" maxlength="60"><input id="l-tel" inputmode="tel" placeholder="WhatsApp com DDD" autocomplete="tel" aria-label="WhatsApp com DDD"><input id="l-cpf" inputmode="numeric" placeholder="CPF" maxlength="14" autocomplete="off" aria-label="CPF">') +
    '<input id="l-email" type="email" placeholder="Seu e-mail" autocomplete="email" aria-label="E-mail"><input id="l-senha" type="password" placeholder="' + (entrar ? 'Sua senha' : 'Crie uma senha (mínimo 8)') + '" autocomplete="' + (entrar ? 'current-password' : 'new-password') + '" aria-label="Senha">' +
    '<button class="b1" type="submit" id="l-btn">' + (entrar ? 'Entrar' : 'Criar conta') + '</button>' +
    '<div class="links"><button type="button" class="troca" data-act="' + (entrar ? 'modo-criar' : 'modo-entrar') + '">' + (entrar ? 'Criar conta' : 'Já tenho conta') + '</button>' + (entrar ? '<button type="button" class="troca" data-act="esqueci">Esqueci minha senha</button>' : '') + '</div>' +
    '<div class="msg" id="l-msg" hidden></div></form></div>';
  $(entrar ? '#l-email' : '#l-nome').focus();
}
async function esqueciSenha(){
  const m = $('#l-msg'); m.hidden = false; m.textContent = 'Fale com o suporte do ChefOnline para criar uma senha nova. Você também pode pagar na entrega, sem conta.';
  try { const s = await api('GET', '/api/suporte'); const c = [s.whatsapp ? '<a href="https://wa.me/' + esc(s.whatsapp) + '" target="_blank" rel="noopener">WhatsApp do suporte</a>' : '', s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>' : ''].filter(Boolean);
    if (c.length) m.innerHTML = esc(m.textContent) + '<br>' + c.join(' · '); } catch (e) {}
}
function alternarFav(slug){
  const i = S.favs.indexOf(slug), on = i < 0;
  on ? S.favs.push(slug) : S.favs.splice(i, 1); salvar(); render();
  toast(on ? rest(slug).nome + ' nos favoritos' : 'Removido dos favoritos');
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('button, [data-fechar]'); if (!el) return;
  const d = el.dataset;
  if ('fechar' in d && (e.target === el || el.tagName === 'BUTTON')){ fechar(); return; }
  if (d.go){ ir(d.go); return; }
  if (d.abrir){ ir('rest', { rid: d.abrir }); return; }
  if (d.add){ adicionar(d.add); return; }
  if (d.menos){ tirar(d.menos); return; }
  if (d.trocar){ S.cart = { rid: null, itens: {} }; fechar(); adicionar(d.trocar); return; }
  if (d.fav){ alternarFav(d.fav); return; }
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
    try { await api('POST', '/api/acompanhar/' + id + '/avaliacao', { c: m.c, nota: S.aval[id], comentario: ($('#c-' + id) || {}).value || '' }); toast('Obrigado pela avaliação!'); const p = S.pedidos.find(x => x.id === id); p.avaliacao = { nota: S.aval[id] }; render(); atualizarVitrine(); }
    catch (err) { toast(err.message); } return; }
  if (d.repetir){ const p = S.pedidos.find(x => x.id === d.repetir); const r = rest(p.restaurante.slug); S.cart = { rid: r.id, itens: {} };
    p.linhas.forEach(l => { const pr = r.pratos.find(x => x.id === l.produto || x.nome === l.nome); if (pr) S.cart.itens[pr.id] = (S.cart.itens[pr.id] || 0) + l.qtd; }); salvar(); ir('carrinho'); toast('Itens de volta no carrinho'); return; }
  if (d.sug){ const [t, id] = d.sug.split(':'); $('#sugest').hidden = true; ir('rest', { rid: t === 'r' ? id : prato(id).rid }); return; }
  switch (d.act){
    case 'recarregar': location.reload(); break;
    case 'filtro': S.filtroAberto = !S.filtroAberto; render(); break;
    case 'limpar-q': S.q = ''; $('#busca').value = ''; render(); break;
    case 'voltar': ir(S.voltarPara || 'home'); break;
    case 'pedir': pedir(); break;
    case 'login': pedirDepoisDoLogin = false; abrirLogin(); break;
    case 'sair': sairDaConta(); render(); toast('Você saiu da conta'); break;
    case 'modo-entrar': abrirLogin('', 'entrar'); break;
    case 'modo-criar': abrirLogin(''); break;
    case 'esqueci': esqueciSenha(); break;
  }
});
document.addEventListener('click', e => { if (e.target.closest('.caixa [data-go]')) fechar(); });
document.addEventListener('submit', async e => {
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
  const t = e.target;
  if (t.id === 'busca'){ mostrarSugest(t.value); return; }
  if (t.id === 'end'){ S.checkout.end = t.value; salvar(); return; }
  if (t.id === 'tel'){ S.checkout.tel = t.value; salvar(); return; }
  if (t.id === 'nome'){ S.checkout.nome = t.value; salvar(); return; }
  if (t.id === 'cpf' || t.id === 'l-cpf'){ const v = fmtCpf(t.value); if (v !== t.value) t.value = v; if (t.id === 'cpf') S.checkout.cpf = v; return; } // o CPF não fica salvo no aparelho
  if (t.id === 'troco'){ S.checkout.troco = t.value; return; }
  if (t.id === 'f-preco'){ S.maxPreco = +t.value; $('#f-preco-v').textContent = brlCurto(S.maxPreco); return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'f-ordem'){ S.ordem = t.value; render(); }
  if (t.id === 'f-nota'){ S.notaMin = +t.value; render(); }
  if (t.id === 'f-fav'){ S.soFav = t.checked; render(); }
  if (t.id === 'f-preco'){ render(); }
  if (t.id === 'bairro'){ S.checkout.bairro = t.value; salvar(); render(); }
});
function mostrarSugest(v){
  const box = $('#sugest'), q = norm(v.trim());
  if (!q){ box.hidden = true; return; }
  const rs = R.filter(r => norm(r.nome + ' ' + r.cat).includes(q)).slice(0, 3);
  const ps = PRATOS.filter(p => norm(p.nome + ' ' + p.desc).includes(q)).slice(0, 5);
  box.innerHTML = (rs.map(r => '<button data-sug="r:' + r.id + '">' + foto(r.img, '', '', r.cor, r.nome[0]) + '<span><strong>' + esc(r.nome) + '</strong><small>Restaurante · ' + esc(r.cat) + '</small></span></button>').join('') +
    ps.map(p => '<button data-sug="p:' + p.id + '">' + fotoPrato(p, '') + '<span><strong>' + esc(p.nome) + '</strong><small>' + esc(rest(p.rid).nome) + ' · ' + brl(p.preco) + '</small></span></button>').join('')) || '<div class="vazio">Nada encontrado para “' + esc(v) + '”.</div>';
  box.hidden = false;
}
$('#busca').addEventListener('keydown', e => { if (e.key === 'Enter'){ $('#sugest').hidden = true; ir('cardapio', { q: e.target.value.trim(), cat: null }); } });
document.addEventListener('pointerdown', e => { if (!e.target.closest('.busca')) $('#sugest').hidden = true; });

/* ---------- início ---------- */
function lerHash(){ const h = location.hash.slice(1); if (['home', 'cardapio', 'carrinho', 'pedidos'].includes(h)) S.rota = h; else if (h && rest(h)){ S.rota = 'rest'; S.rid = h; } }
window.addEventListener('hashchange', () => { lerHash(); fechar(); if (S.rota === 'pedidos') carregarPedidos(); render(); window.scrollTo(0, 0); });
(async function(){
  try { await carregarVitrine(); }
  catch (e) { $('#app').innerHTML = '<div class="vazio-g"><strong>Não foi possível carregar os restaurantes</strong>' + esc(e.message) + '<div style="margin-top:14px"><button class="btn" data-act="recarregar">Tentar de novo</button></div></div>'; return; }
  lerHash();
  if (S.token){ try { S.user = (await api('GET', '/api/clientes/eu')).cliente; salvar(); } catch (e) {} }
  conectarTempoReal();
  if (S.rota === 'pedidos') carregarPedidos();
  render();
})();
})();
