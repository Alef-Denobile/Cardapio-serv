/* Cardápio do salão: para quem já está no restaurante.
   /r/<restaurante>/mesa/<n>?t=<código>  -> pede pela mesa (QR Code da mesa), chama o garçom e pede a conta
   /r/<restaurante>/salao                 -> só o cardápio, sem pedir (QR na entrada, no balcão, na vitrine)
   Sem tela de início: barra lateral com as categorias, os pratos e o carrinho. */
(function(){
'use strict';
const N = n => String(n == null ? '' : n).padStart(3, '0'); // número do pedido do dia: 001, 002…
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ler = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
function toast(t){ const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3000); }
async function api(m, url, corpo){
  let r; try { r = await fetch(url, { method: m, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); }
  catch (e) { throw new Error('Sem conexão. Confira a internet e tente de novo.'); }
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.erro || 'Algo deu errado. Tente de novo.'), { status: r.status }); return d;
}

const rota = /^\/r\/([a-z0-9-]+)\/(?:mesa\/(\d+)|salao)\/?$/.exec(location.pathname) || [];
const SLUG = rota[1] || '', MESA = rota[2] ? Math.trunc(+rota[2]) : 0, TOKEN = new URLSearchParams(location.search).get('t') || '';
const CHAVE = 'salao:' + SLUG + ':' + MESA;
let R = null, P = [];
const S = { cat: null, q: '', cart: ler(CHAVE + ':cart', []), mesaOk: false, item: null, aberto: false, nome: ler('salao:nome', ''), tel: ler('salao:tel', ''), pag: 'local', obs: '', enviando: false,
  meus: ler(CHAVE + ':pedidos', []).filter(x => x && x.id && x.c && new Date(x.em).toDateString() === new Date().toDateString()), pedidos: [], conta: null, contaF: { pag: 'cartao', pessoas: 1 }, contaOk: null, socket: null };
const salvar = () => { gravar(CHAVE + ':cart', S.cart); gravar(CHAVE + ':pedidos', S.meus.slice(0, 15)); gravar('salao:nome', S.nome); };

const prod = id => P.find(p => p.id === id);
const unit = (p, sel) => p.preco + (p.opcoes || []).reduce((a, o, oi) => a + ((sel[oi] || []).reduce((b, x) => b + ((o.escolhas[x] || {}).preco || 0), 0)), 0);
const nomesSel = (p, sel) => (p.opcoes || []).flatMap((o, oi) => (sel[oi] || []).map(x => (o.escolhas[x] || {}).nome)).filter(Boolean);
const linhas = () => S.cart.map(l => ({ l, p: prod(l.id) })).filter(x => x.p && !x.p.esgotado);
const subtotal = () => linhas().reduce((a, x) => a + unit(x.p, x.l.sel) * x.l.q, 0);
const qtd = id => S.cart.filter(l => id == null || l.id === id).reduce((a, l) => a + l.q, 0);
const cats = () => (R.categorias || []).concat([...new Set(P.map(p => p.categoria))].filter(c => !(R.categorias || []).includes(c))).filter(c => P.some(p => p.categoria === c));
// Sem QR de mesa (menu do salão), o pedido vai para retirar no balcão
const balcao = () => !MESA && (R.tipos || []).includes('retirada');
const podeAdd = () => S.mesaOk || balcao();
const podePedir = () => podeAdd() && (R.aberto || R.aceitarForaDoHorario);
const foto = (p, cls) => p.fotoUrl ? '<img class="' + cls + '" src="' + esc(p.fotoUrl) + '" alt="" loading="lazy">' : '<span class="' + cls + ' ph" aria-hidden="true">' + esc(p.nome[0]) + '</span>';
const pagsBalcao = () => ((R.pagamentos && R.pagamentos.retirada) || ['local']).filter(m => m === 'local' || m === 'pix');
const STATUS_B = { novo: 'Recebido pela cozinha', preparo: 'Em preparo', pronto: 'Pronto! Retire no balcão', entregue: 'Retirado', cancelado: 'Cancelado' };
const stTxt = p => (p.tipo === 'retirada' ? STATUS_B[p.status] : STATUS[p.status]) || p.status;
const STATUS = { aguardando: 'Aguardando', novo: 'Recebido pela cozinha', preparo: 'Em preparo', pronto: 'Pronto, já vai para a mesa', rota: 'A caminho', entregue: 'Servido', cancelado: 'Cancelado' };
const ICO = {
  garcom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17h16"/><path d="M6 17a6 6 0 0 1 12 0"/><path d="M12 8V6"/><path d="M10 6h4"/></svg>',
  conta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  busca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  carr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h3l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>'
};

/* ---------- topo ---------- */
function renderTopo(){
  const logo = R.logoUrl ? '<img class="sl-logo" src="' + esc(R.logoUrl) + '" alt="">' : '<span class="sl-logo mono" aria-hidden="true">' + esc(R.nome.split(/\s+/).map(w => w[0]).join('').slice(0, 2)) + '</span>';
  const chamados = S.mesaOk && R.recursos.chamados !== false;
  $('#topo').innerHTML = '<div class="sl-marca">' + logo + '<div><strong>' + esc(R.nome) + '</strong><span>' + (MESA && S.mesaOk ? 'Mesa ' + pad(MESA) : 'Cardápio') + ' · ' + (R.aberto ? 'aberto até ' + esc(R.fecha) : 'fechado agora') + '</span></div></div>' +
    '<label class="sl-busca"><span class="sr">Buscar no cardápio</span>' + ICO.busca + '<input id="busca" type="search" placeholder="Buscar prato" value="' + esc(S.q) + '" autocomplete="off"></label>' +
    (podeAdd() ? '<div class="sl-acoes">' + (chamados ? '<button class="sl-bt" data-act="garcom" id="bt-garcom">' + ICO.garcom + '<span>Chamar garçom</span></button><button class="sl-bt" data-act="conta">' + ICO.conta + '<span>Conta</span></button>' : '') +
      '<button class="sl-bt sl-bt-carr" data-act="abrir-carr" id="bt-carr" aria-label="Abrir o carrinho">' + ICO.carr + '<span class="sl-cn" id="carr-n" hidden></span></button></div>' : '');
  let av = '';
  if (MESA && !S.mesaOk) av = 'Este QR Code não é válido ou foi trocado. Você pode ver o cardápio; para pedir, chame o garçom.';
  else if (!MESA && !balcao()) av = 'Para pedir, aponte a câmera do celular para o QR Code da sua mesa.';
  else if (!MESA && podePedir()) av = 'Pedido para retirar no balcão. Está numa mesa? Use o QR Code dela para receber na mesa.';
  else if (!podePedir()) av = 'Estamos fechados agora. Os pedidos voltam às ' + R.abre + '.';
  $('#aviso').hidden = !av; $('#aviso').textContent = av;
}

/* ---------- categorias (barra lateral) e pratos ---------- */
function renderCats(){
  const cs = cats();
  $('#cats').innerHTML = cs.map((c, i) => { const p = P.find(x => x.categoria === c && x.fotoUrl) || P.find(x => x.categoria === c);
    return '<button data-cat="' + i + '" aria-current="' + (S.cat === i || (S.cat == null && i === 0)) + '">' + foto(p, 'sl-ci') + '<span>' + esc(c) + '</span></button>'; }).join('');
}
function itemHtml(p){
  const n = qtd(p.id), extra = (p.opcoes || []).some(o => o.escolhas.some(e => e.preco));
  return '<article class="sl-item' + (p.esgotado ? ' off' : '') + '"><button class="sl-ver" data-ver="' + p.id + '"' + (p.esgotado ? ' disabled' : '') + '>' + foto(p, 'sl-foto') +
    '<span class="sl-txt"><strong>' + esc(p.nome) + '</strong><small>' + esc(p.descricao) + '</small>' +
    ((p.selos || []).length ? '<span class="sl-selos">' + p.selos.map(s => '<i>' + esc(s) + '</i>').join('') + '</span>' : '') + '</span></button>' +
    '<div class="sl-lado"><b>' + (extra ? '<em>a partir de</em>' : '') + brl(p.preco) + '</b>' +
    (p.esgotado ? '<span class="sl-esg">Esgotado</span>' : podeAdd() ? '<button class="sl-mais" data-add="' + p.id + '" aria-label="Adicionar ' + esc(p.nome) + '"><span aria-hidden="true">+</span> Adicionar' + (n ? '<span class="sl-n">' + n + '</span>' : '') + '</button>' : '') + '</div></article>';
}
// Mostra só a categoria escolhida na barra lateral; com busca, mostra os resultados de todas
function renderProds(){
  const q = norm(S.q), cs = cats();
  if (S.cat == null || S.cat >= cs.length) S.cat = 0;
  if (q) {
    const l = P.filter(p => norm(p.nome + ' ' + p.descricao + ' ' + p.categoria).includes(q));
    $('#prods').innerHTML = '<section class="sl-sec"><h2>Resultados para “' + esc(S.q) + '” <small>' + l.length + (l.length === 1 ? ' item' : ' itens') + '</small></h2>' +
      (l.length ? '<div class="sl-lista">' + l.map(itemHtml).join('') + '</div>' : '<p class="sl-vazio">Nada encontrado. Tente outra palavra.</p>') + '</section>';
    return;
  }
  const c = cs[S.cat], l = P.filter(p => p.categoria === c);
  $('#prods').innerHTML = '<section class="sl-sec"><h2>' + esc(c) + ' <small>' + l.length + (l.length === 1 ? ' item' : ' itens') + '</small></h2><div class="sl-lista">' + l.map(itemHtml).join('') + '</div></section>';
}
function marcarCat(i){
  S.cat = i; $$('#cats button').forEach(b => b.setAttribute('aria-current', String(!S.q && +b.dataset.cat === i)));
  const b = $('#cats button[data-cat="' + i + '"]'); if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ---------- carrinho ---------- */
function renderCarr(){
  const ls = linhas(), sub = subtotal(), serv = Math.round(sub * (R.taxaServico || 0)) / 100;
  const sug = ls.length ? Sugestoes.escolher(P, S.cart.map(l => l.id), 3) : [];
  const meus = S.pedidos.filter(p => S.meus.some(m => m.id === p.id));
  let h = '<div class="sl-carr-h"><h2>' + ICO.carr + 'Seu pedido</h2>' + (MESA && S.mesaOk ? '<span class="sl-tag">Mesa ' + pad(MESA) + '</span>' : '') + '<button class="sl-x" data-act="fechar-carr" aria-label="Fechar">×</button></div>';
  const B = !S.mesaOk && balcao(), servB = B ? 0 : serv;
  if (!podeAdd()) h += '<p class="sl-dica">' + (MESA ? 'Este QR Code não vale mais. Peça ao garçom para conferir.' : 'Este é o cardápio do salão. Para pedir pelo celular, use o QR Code da sua mesa.') + '</p>';
  else if (!ls.length) h += '<p class="sl-dica">Toque no + dos pratos para montar o pedido. Ele vai direto para a cozinha.</p>';
  else {
    h += '<div class="sl-linhas">' + ls.map(x => { const ns = nomesSel(x.p, x.l.sel);
        return '<div class="sl-linha">' + foto(x.p, 'sl-th') + '<div class="sl-ln"><strong>' + esc(x.p.nome) + '</strong>' + (ns.length ? '<small>' + esc(ns.join(' · ')) + '</small>' : '') + '<b>' + brl(unit(x.p, x.l.sel) * x.l.q) + '</b></div>' +
          '<div class="sl-step"><button data-linha="' + esc(x.l.k) + '" data-d="-1" aria-label="Tirar um">−</button><span>' + x.l.q + '</span><button data-linha="' + esc(x.l.k) + '" data-d="1" aria-label="Mais um">+</button></div></div>'; }).join('') + '</div>' +
      (sug.length ? '<div class="sl-peca"><p>Peça também</p>' + sug.map(p => '<button class="sl-peca-i" data-add="' + p.id + '">' + foto(p, 'sl-pth') + '<span>' + esc(p.nome) + '<small>' + brl(p.preco) + '</small></span><i aria-hidden="true">+</i></button>').join('') + '</div>' : '') +
      (B ? '<label class="sl-l" for="sl-nome">Seu nome</label><input id="sl-nome" maxlength="40" value="' + esc(S.nome) + '" autocomplete="given-name" placeholder="Para chamarmos quando ficar pronto">' +
          '<p class="sl-l">Pagamento</p><div class="sl-seg">' + pagsBalcao().map(m => '<button data-bpag="' + m + '" aria-pressed="' + (S.pag === m) + '">' + (m === 'pix' ? 'Pix' : 'No caixa') + '</button>').join('') + '</div>'
        : '<label class="sl-l" for="sl-nome">Seu nome <small>(opcional, ajuda o garçom)</small></label><input id="sl-nome" maxlength="40" value="' + esc(S.nome) + '" autocomplete="given-name">') +
      '<label class="sl-l" for="sl-obs">Observações</label><input id="sl-obs" maxlength="300" placeholder="Ex.: sem cebola" value="' + esc(S.obs) + '">' +
      '<div class="sl-tot"><div><span>Subtotal</span><span>' + brl(sub) + '</span></div>' + (servB ? '<div><span>Serviço (' + R.taxaServico + '%)</span><span>' + brl(servB) + '</span></div>' : '') + '<div class="t"><span>Total</span><span>' + brl(sub + servB) + '</span></div></div>' +
      '<button class="sl-enviar" data-act="enviar"' + (podePedir() && !S.enviando ? '' : ' disabled') + '>' + (S.enviando ? 'Enviando…' : 'Finalizar pedido') + '</button>' +
      '<p class="sl-dica">' + (B ? (S.pag === 'pix' && R.chavePix ? 'Pague com Pix na chave ' + esc(R.chavePix) + ' e mostre no balcão. ' : 'Pague no caixa ao retirar. ') + 'Retire no balcão quando chamarmos seu número.' : 'Você paga no final, quando pedir a conta.') + '</p>';
  }
  if (meus.length) h += '<div class="sl-meus"><p>' + (MESA ? 'Pedidos desta mesa' : 'Seus pedidos') + '</p>' + meus.map(p => '<div class="sl-meu ' + p.status + '"><strong>#' + N(p.numero) + '</strong><span>' + esc(stTxt(p)) + '</span><small>' + p.linhas.map(l => l.qtd + '× ' + esc(l.nome)).join(', ') + '</small></div>').join('') +
    (S.mesaOk && R.recursos.chamados !== false ? '<button class="sl-sec-bt" data-act="conta">' + ICO.conta + 'Ver e pedir a conta</button>' : '') + '</div>';
  $('#carr').innerHTML = h;
  // barra de baixo (celular)
  const n = qtd(), ativo = meus.find(p => !['entregue', 'cancelado'].includes(p.status));
  $('#barra').hidden = !(n || ativo);
  $('#barra').innerHTML = n ? '<button data-act="abrir-carr"><span>' + ICO.carr + n + (n > 1 ? ' itens' : ' item') + '</span><strong>Ver pedido · ' + brl(sub + servB) + '</strong></button>'
    : ativo ? '<button data-act="abrir-carr" class="acomp"><span>Pedido #' + N(ativo.numero) + '</span><strong>' + esc(stTxt(ativo)) + '</strong></button>' : '';
  document.body.classList.toggle('carr-aberto', S.aberto);
  const cn = $('#carr-n'); if (cn){ cn.hidden = !n; cn.textContent = n; $('#bt-carr').setAttribute('aria-label', n ? 'Abrir o carrinho, ' + n + (n > 1 ? ' itens' : ' item') : 'Abrir o carrinho'); }
  $('#fundo').hidden = !S.aberto;
  if (S.aberto && !renderCarr.foco){ renderCarr.foco = true; setTimeout(() => { const x = $('#carr .sl-x'); if (x) x.focus(); }, 50); } else if (!S.aberto) renderCarr.foco = false;
}
function render(){ renderTopo(); renderCats(); renderProds(); renderCarr(); }
function atualizarItens(){ renderProds(); renderCarr(); }

/* ---------- prato com opções ---------- */
function abrirItem(id){
  const p = prod(id); if (!p || p.esgotado) return;
  S.item = { id, q: 1, sel: {} }; (p.opcoes || []).forEach((o, oi) => { S.item.sel[oi] = o.tipo === 'um' ? [0] : []; });
  desenharItem();
}
function desenharItem(){
  const p = prod(S.item.id), it = S.item;
  $('#modal').innerHTML = '<div class="sl-veu" data-act="fechar-modal"><div class="sl-caixa" role="dialog" aria-modal="true" aria-labelledby="it-n">' + (p.fotoUrl ? '<img class="sl-ifoto" src="' + esc(p.fotoUrl) + '" alt="">' : '') +
    '<div class="sl-ib"><h2 id="it-n">' + esc(p.nome) + '</h2><p>' + esc(p.descricao) + '</p>' +
    (p.opcoes || []).map((o, oi) => '<fieldset><legend>' + esc(o.nome) + ' <small>' + (o.tipo === 'um' ? 'escolha 1' : 'opcional') + '</small></legend>' + o.escolhas.map((e, ei) =>
      '<button type="button" class="sl-op" data-op="' + oi + ':' + ei + '" aria-pressed="' + it.sel[oi].includes(ei) + '"><span>' + esc(e.nome) + '</span>' + (e.preco ? '<b>+ ' + brl(e.preco) + '</b>' : '') + '</button>').join('') + '</fieldset>').join('') +
    (podeAdd() ? '<div class="sl-if"><div class="sl-step g"><button data-iq="-1" aria-label="Menos">−</button><span>' + it.q + '</span><button data-iq="1" aria-label="Mais">+</button></div><button class="sl-enviar" data-act="por-item">Adicionar · ' + brl(unit(p, it.sel) * it.q) + '</button></div>' : '<p class="sl-dica">Para pedir, use o QR Code da sua mesa.</p>') +
    '</div><button class="sl-x sl-x-m" data-act="fechar-modal" aria-label="Fechar">×</button></div></div>';
}
function fecharModal(){ $('#modal').innerHTML = ''; S.item = null; }
function colocar(id, sel, q){
  const p = prod(id), k = id + '|' + JSON.stringify(sel), l = S.cart.find(x => x.k === k);
  if (l) l.q += q; else S.cart.push({ k, id, sel, q });
  salvar(); atualizarItens(); toast((q > 1 ? q + '× ' : '') + p.nome + ' no carrinho');
  const b = $('#bt-carr'); if (b){ b.classList.remove('pulo'); void b.offsetWidth; b.classList.add('pulo'); }
}
function adicionar(id){ const p = prod(id); if (!p || p.esgotado || !podeAdd()) return; if ((p.opcoes || []).length) abrirItem(id); else colocar(id, {}, 1); }

/* ---------- enviar, acompanhar ---------- */
async function enviar(){
  const ls = linhas(); if (!ls.length || !podePedir()) return;
  const B = !S.mesaOk && balcao();
  if (B){
    if ((S.nome || '').trim().length < 2){ toast('Diga seu nome para chamarmos quando ficar pronto.'); const i = $('#sl-nome'); if (i) i.focus(); return; }
  }
  S.enviando = true; renderCarr();
  try {
    const corpo = B ? { tipo: 'retirada', local: true, cliente: { nome: S.nome.trim() }, pagamento: { metodo: pagsBalcao().includes(S.pag) ? S.pag : 'local' } }
      : { tipo: 'mesa', mesa: { numero: MESA, token: TOKEN }, cliente: { nome: S.nome || 'Mesa ' + pad(MESA) }, pagamento: { metodo: 'local' } };
    const d = await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/pedidos', Object.assign(corpo, { itens: ls.map(x => ({ produto: x.p.id, qtd: x.l.q, escolhas: x.l.sel })), obs: S.obs }));
    S.meus.unshift({ id: d.pedido.id, c: d.codigo, em: Date.now() }); S.pedidos.unshift(d.pedido);
    S.cart = []; S.obs = ''; S.enviando = false; salvar(); conectar(); atualizarItens();
    toast('Pedido #' + N(d.pedido.numero) + (B ? ' enviado! Avisamos aqui quando ficar pronto.' : ' enviado para a cozinha!'));
  } catch (e) { S.enviando = false; renderCarr(); toast(e.message); if (e.status === 409) recarregar(); }
}
async function carregarPedidos(){
  if (!S.meus.length) return;
  try { S.pedidos = (await api('POST', '/api/acompanhar', { pedidos: S.meus.slice(0, 15).map(x => ({ id: x.id, c: x.c })) })).pedidos; renderCarr(); } catch (e) {}
}
function conectar(){
  if (typeof io !== 'function' || !S.meus.length) return;
  if (S.socket) S.socket.close();
  S.socket = io({ auth: { pedidos: S.meus.slice(0, 15).map(x => ({ id: x.id, c: x.c })) } });
  S.socket.on('pedido:atualizado', p => { const i = S.pedidos.findIndex(x => x.id === p.id); if (i >= 0){ const antes = S.pedidos[i].status; S.pedidos[i] = Object.assign({}, S.pedidos[i], p); if (antes !== p.status) toast('Pedido #' + N(p.numero) + ': ' + STATUS[p.status].toLowerCase()); } else carregarPedidos(); renderCarr(); });
  S.socket.on('connect', carregarPedidos);
}
async function recarregar(){ try { const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG)); R = d.restaurante; P = d.produtos; S.cart = S.cart.filter(l => prod(l.id) && !prod(l.id).esgotado); salvar(); render(); } catch (e) {} }

/* ---------- garçom e conta ---------- */
async function chamarGarcom(btn){
  btn.disabled = true;
  try { const d = await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/chamados', { mesa: MESA, token: TOKEN, tipo: 'garcom' });
    toast(d.repetido ? 'O garçom já foi chamado e está a caminho.' : 'Garçom chamado para a Mesa ' + pad(MESA) + '.');
    btn.querySelector('span').textContent = 'Garçom chamado ✓'; setTimeout(() => { const b = $('#bt-garcom'); if (b){ b.disabled = false; b.querySelector('span').textContent = 'Chamar garçom'; } }, 60000);
  } catch (e) { toast(e.message); btn.disabled = false; }
}
const PAGS = [['pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']];
async function abrirConta(){
  S.contaOk = null; S.conta = null;
  $('#modal').innerHTML = '<div class="sl-veu" data-act="fechar-modal"><div class="sl-caixa sl-conta" role="dialog" aria-modal="true" aria-labelledby="ct-t"><div class="sl-ib"><h2 id="ct-t">Conta da Mesa ' + pad(MESA) + '</h2><p>Carregando…</p></div></div></div>';
  try { S.conta = (await api('GET', '/api/r/' + encodeURIComponent(SLUG) + '/mesa/' + MESA + '/conta?t=' + encodeURIComponent(TOKEN))).conta; } catch (e) { S.conta = { erro: e.message }; }
  desenharConta();
}
function desenharConta(){
  const c = S.conta, F = S.contaF; if (!c || !$('#modal').innerHTML) return;
  const pags = PAGS.filter(x => x[0] !== 'pix' || R.recursos.pix !== false); if (!pags.some(x => x[0] === F.pag)) F.pag = pags[0][0];
  const it = new Map();
  (c.pedidos || []).forEach(p => p.linhas.forEach(l => { const k = l.nome + '|' + l.opcoes.join(','); const x = it.get(k) || { nome: l.nome, opcoes: l.opcoes, qtd: 0, v: 0 }; x.qtd += l.qtd; x.v += l.unit * l.qtd; it.set(k, x); }));
  const ok = S.contaOk;
  const corpo = c.erro ? '<p class="sl-dica">' + esc(c.erro) + '</p>' : !c.pedidos.length ? '<p class="sl-dica">Ainda não há pedidos em aberto nesta mesa pelo celular. Se você pediu com o garçom, ele traz a conta completa.</p>' :
    '<div class="sl-tot">' + [...it.values()].map(x => '<div><span>' + x.qtd + '× ' + esc(x.nome) + (x.opcoes.length ? ' <small>' + esc(x.opcoes.join(' · ')) + '</small>' : '') + '</span><span>' + brl(x.v) + '</span></div>').join('') +
      '<div class="s"><span>Subtotal</span><span>' + brl(c.subtotal) + '</span></div>' + (c.servico ? '<div><span>Serviço (' + R.taxaServico + '%)</span><span>' + brl(c.servico) + '</span></div>' : '') + '<div class="t"><span>Total</span><span>' + brl(c.total) + '</span></div></div>' +
    '<p class="sl-l">Como vai pagar?</p><div class="sl-seg">' + pags.map(x => '<button data-cpag="' + x[0] + '" aria-pressed="' + (F.pag === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
    '<p class="sl-l">Dividir a conta</p><div class="sl-div"><div class="sl-step g"><button data-cpes="-1" aria-label="Menos uma pessoa">−</button><span>' + F.pessoas + '</span><button data-cpes="1" aria-label="Mais uma pessoa">+</button></div><span>' + (F.pessoas > 1 ? F.pessoas + ' pessoas · <strong>' + brl(c.total / F.pessoas) + ' cada</strong>' : '1 pessoa') + '</span></div>' +
    (ok ? '<p class="sl-ok">Pronto! O garçom já vem com a conta.</p>' : '') +
    '<button class="sl-enviar" data-act="pedir-conta"' + (ok ? ' disabled' : '') + '>' + (ok ? 'Conta pedida ✓' : 'Pedir a conta ao garçom') + '</button>';
  $('#modal').innerHTML = '<div class="sl-veu" data-act="fechar-modal"><div class="sl-caixa sl-conta" role="dialog" aria-modal="true" aria-labelledby="ct-t"><div class="sl-ib"><h2 id="ct-t">Conta da Mesa ' + pad(MESA) + '</h2>' + corpo + '</div><button class="sl-x sl-x-m" data-act="fechar-modal" aria-label="Fechar">×</button></div></div>';
}
async function pedirConta(btn){
  btn.disabled = true; btn.textContent = 'Chamando…';
  try { const d = await api('POST', '/api/r/' + encodeURIComponent(SLUG) + '/chamados', { mesa: MESA, token: TOKEN, tipo: 'conta', pagamento: S.contaF.pag, pessoas: S.contaF.pessoas });
    S.contaOk = d.chamado; if (d.conta) S.conta = d.conta; desenharConta(); toast('Conta pedida. O garçom já vem.'); }
  catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Pedir a conta ao garçom'; }
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('button, [data-act]'); if (!el) return;
  const d = el.dataset;
  if (d.act === 'fechar-modal'){ if (el.classList.contains('sl-veu') && e.target !== el) return; fecharModal(); return; }
  if (d.cat !== undefined){ if (S.q){ S.q = ''; const bu = $('#busca'); if (bu) bu.value = ''; } marcarCat(+d.cat); renderProds(); window.scrollTo(0, 0); return; }
  if (d.ver){ abrirItem(d.ver); return; }
  if (d.add){ adicionar(d.add); return; }
  if (d.linha){ const l = S.cart.find(x => x.k === d.linha); if (!l) return; l.q += +d.d; if (l.q <= 0) S.cart = S.cart.filter(x => x !== l); salvar(); atualizarItens(); return; }
  if (d.op){ const [oi, ei] = d.op.split(':').map(Number), o = prod(S.item.id).opcoes[oi];
    if (o.tipo === 'um') S.item.sel[oi] = [ei]; else { const st = new Set(S.item.sel[oi]); st.has(ei) ? st.delete(ei) : st.add(ei); S.item.sel[oi] = [...st].sort((a, b) => a - b); }
    desenharItem(); return; }
  if (d.iq){ S.item.q = Math.max(1, Math.min(30, S.item.q + +d.iq)); desenharItem(); return; }
  if (d.bpag){ S.pag = d.bpag; renderCarr(); return; }
  if (d.cpag){ S.contaF.pag = d.cpag; desenharConta(); return; }
  if (d.cpes){ S.contaF.pessoas = Math.max(1, Math.min(30, S.contaF.pessoas + +d.cpes)); desenharConta(); return; }
  switch (d.act){
    case 'por-item': { const it = S.item; fecharModal(); colocar(it.id, it.sel, it.q); break; }
    case 'enviar': enviar(); break;
    case 'garcom': chamarGarcom(el); break;
    case 'conta': abrirConta(); break;
    case 'pedir-conta': pedirConta(el); break;
    case 'abrir-carr': S.aberto = true; renderCarr(); break;
    case 'fechar-carr': S.aberto = false; renderCarr(); const b = $('#bt-carr'); if (b) b.focus(); break;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'busca'){ S.q = t.value; renderProds(); marcarCat(S.cat); return; }
  if (t.id === 'sl-nome'){ S.nome = t.value; salvar(); return; }
  if (t.id === 'sl-obs'){ S.obs = t.value; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if ($('#modal').innerHTML) fecharModal(); else if (S.aberto){ S.aberto = false; renderCarr(); } } });
document.addEventListener('error', e => { const img = e.target; if (!(img instanceof HTMLImageElement) || img.dataset.falhou) return; img.dataset.falhou = '1';
  const box = img.closest('[data-ver],[data-cat],[data-add],.sl-linha'), nome = box ? ((prod(box.dataset.ver || box.dataset.add) || {}).nome || (box.textContent || '').trim()) : '';
  const ph = document.createElement('span'); ph.className = img.className + ' ph'; ph.setAttribute('aria-hidden', 'true'); ph.textContent = (nome || '•')[0]; img.replaceWith(ph); }, true);

/* ---------- início ---------- */
(async function(){
  try {
    if (!SLUG) throw new Error('Endereço do cardápio incompleto.');
    const d = await api('GET', '/api/r/' + encodeURIComponent(SLUG)); R = d.restaurante; P = d.produtos;
    if (MESA){ try { S.mesaOk = (await api('GET', '/api/r/' + encodeURIComponent(SLUG) + '/mesa/' + MESA + '?t=' + encodeURIComponent(TOKEN))).valida; } catch (e) { S.mesaOk = false; } }
  } catch (e) { $('#prods').innerHTML = '<p class="sl-vazio">' + (e.status === 404 ? 'Restaurante não encontrado. Confira o link.' : esc(e.message)) + '</p>'; return; }
  document.title = R.nome + (MESA ? ' · Mesa ' + pad(MESA) : ' · Cardápio');
  if (/^#[0-9a-f]{6}$/i.test(R.cor || '')) document.documentElement.style.setProperty('--cor', R.cor);
  S.cart = S.cart.filter(l => l && l.k && prod(l.id) && !prod(l.id).esgotado);
  if (!podeAdd()) S.cart = [];
  render(); carregarPedidos(); conectar();
})();
})();
