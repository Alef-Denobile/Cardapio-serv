/* Painel do restaurante: dono, cozinha e entregador */
(function(){
'use strict';
const { $, $$, esc, brl, pad, hora, ago, initials, toast, aplicarCor, foto, api, guardar, copiar, pagTxt, trocoTxt, ajudaSenha } = C;
ajudaSenha('Cozinha ou entregador: peça ao dono do restaurante para criar uma senha nova para você (Painel → Equipe → Nova senha). Dono: fale com o suporte da plataforma, que define uma senha nova para você.');
const SELOS = ['vegetariano', 'vegano', 'sem glúten'];
const PAPEL = { dono: 'Dono', cozinha: 'Cozinha', entregador: 'Entregador' };
const ABAS = {
  dono: [['pedidos', 'Pedidos'], ['produtos', 'Produtos'], ['hist', 'Histórico e financeiro'], ['mapa', 'Mapa das mesas'], ['mesas', 'Mesas e QR Codes'], ['equipe', 'Equipe'], ['config', 'Configurações']],
  cozinha: [['pedidos', 'Pedidos'], ['produtos', 'Produtos']],
  entregador: [['entregas', 'Minhas entregas']]
};
if (typeof qrcode === 'function' && qrcode.stringToBytesFuncs) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const S = { token: guardar.ler('painel:token', ''), eu: null, rest: null, aba: '', pedidos: [], chamados: [], finalizadosHoje: 0, entregadores: [], produtos: [], mesas: [], equipe: [], config: null,
  imp: Object.assign({ auto: false, largura: 80 }, guardar.ler('painel:impressora', {})), impAberta: false, impressos: new Set(guardar.ler('painel:impressos', [])),
  kf: 'todos', hp: '7', hc: 'todos', hq: '', hn: 25, hm: 'n', rel: null, premAberta: false, vistos: new Set(), editId: null, formAberto: false, confirmar: null, socket: null };
const chamar = (m, u, b) => api(m, u, b, S.token).catch(e => { if (e.status === 401) sair(e.message); throw e; });

/* ---------- login ---------- */
async function iniciar(){
  if (!S.token) return mostrarLogin();
  try { const d = await chamar('GET', '/api/auth/eu'); S.eu = d.usuario; S.rest = d.restaurante; entrar(); }
  catch (e) { if (e.status !== 401) { mostrarLogin(); $('#l-erro').hidden = false; $('#l-erro').textContent = e.message; } }
}
function mostrarLogin(){ $('#v-login').hidden = false; $('#v-app').hidden = true; setTimeout(() => $('#l-email').focus(), 50); }
$('#f-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#l-btn'), erro = $('#l-erro'); erro.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const d = await api('POST', '/api/auth/login', { email: $('#l-email').value, senha: $('#l-senha').value });
    S.token = d.token; guardar.gravar('painel:token', d.token); S.eu = d.usuario; S.rest = d.restaurante; $('#l-senha').value = '';
    entrar();
  } catch (err) { erro.hidden = false; erro.textContent = err.message; }
  btn.disabled = false; btn.textContent = 'Entrar';
});
function sair(msg){
  guardar.apagar('painel:token'); S.token = ''; if (S.socket) S.socket.close(); S.socket = null;
  mostrarLogin(); if (msg){ $('#l-erro').hidden = false; $('#l-erro').textContent = msg; }
}
function entrar(){
  aplicarCor(S.rest.cor);
  $('#v-login').hidden = true; $('#v-app').hidden = false;
  S.aba = abas()[0][0];
  conectarTempoReal();
  carregarPedidos().then(render);
  if (S.eu.papel !== 'entregador') chamar('GET', '/api/painel/entregadores').then(d => { S.entregadores = d.entregadores; if (S.aba === 'pedidos') render(); }).catch(() => {});
  render();
}

function abas(){ const rc = S.rest.recursos || {}; return ABAS[S.eu.papel].filter(t => !['mesas', 'mapa'].includes(t[0]) || rc.mesa !== false); }

/* ---------- tempo real ---------- */
let audio;
function bip(){ try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .5); o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + .5); } catch (e) {} }
function conectarTempoReal(){
  if (typeof io !== 'function') return;
  if (S.socket) S.socket.close();
  S.socket = io({ auth: { token: S.token } });
  S.socket.on('connect', () => { $('#offline').hidden = true; carregarPedidos().then(() => { if (['pedidos', 'entregas'].includes(S.aba)) render(); }); });
  S.socket.on('disconnect', () => { $('#offline').hidden = false; });
  S.socket.on('connect_error', e => { $('#offline').hidden = false; if (e.message === 'nao-autorizado') sair('Sua sessão expirou. Entre de novo.'); });
  S.socket.on('pedido:novo', p => { if (S.eu.papel === 'entregador'){ if (p.tipo === 'delivery'){ upsert(p); atualizarAbas(); } return; } upsert(p); bip(); toast('Novo pedido #' + p.numero); atualizarAbas(); if (S.imp.auto) imprimirPedido(p, true); });
  S.socket.on('pedido:atualizado', p => {
    if (S.eu.papel === 'entregador' && p.tipo !== 'delivery') return;
    const antes = S.pedidos.find(x => x._id === p._id);
    upsert(p);
    if (S.eu.papel === 'entregador' && p.status === 'pronto' && (!antes || antes.status !== 'pronto')){ bip(); toast('Entrega #' + p.numero + ' pronta para sair'); }
    atualizarAbas();
  });
  S.socket.on('chamado:novo', c => { if (S.eu.papel === 'entregador') return; S.chamados.push(c); bip(); toast('Mesa ' + pad(c.mesa) + (c.tipo === 'conta' ? ' pediu a conta' : ' chamou o garçom')); atualizarAbas(); });
  S.socket.on('chamado:atendido', c => { S.chamados = S.chamados.filter(x => x._id !== c._id); atualizarAbas(); });
}
function upsert(p){
  const i = S.pedidos.findIndex(x => x._id === p._id);
  if (['entregue', 'cancelado'].includes(p.status)){ if (i >= 0) S.pedidos.splice(i, 1); if (p.status === 'entregue') S.finalizadosHoje++; return; }
  if (i >= 0) S.pedidos[i] = p; else S.pedidos.push(p);
}
async function carregarPedidos(){
  try { const d = await chamar('GET', '/api/painel/pedidos'); S.pedidos = d.pedidos; S.chamados = d.chamados; S.finalizadosHoje = d.finalizadosHoje; if (!S.vistos.size) d.pedidos.forEach(p => S.vistos.add(p._id)); } catch (e) { if (e.status !== 401) toast(e.message); }
}
function atualizarAbas(){ renderHead(); if (S.aba === 'pedidos') renderPedidos(); if (S.aba === 'entregas') renderEntregas(); }
setInterval(() => { if (S.aba === 'pedidos') renderPedidos(); if (S.aba === 'entregas') renderEntregas(); }, 30000);

/* ---------- estrutura ---------- */
function renderHead(){
  const logo = S.rest.logoUrl ? '<img class="logo" src="' + esc(S.rest.logoUrl) + '" alt="">' : '<div class="logo mono" aria-hidden="true">' + esc(initials(S.rest.nome)) + '</div>';
  $('#pro-head').innerHTML = '<div class="who">' + logo + '<div><div class="table-tag">Área do restaurante</div><h1>' + esc(S.rest.nome) + '</h1><small>' + esc(S.eu.nome) + ' · ' + PAPEL[S.eu.papel] + '</small></div></div><div class="row" style="margin:0"><a class="btn sm ghost" href="/r/' + esc(S.rest.slug) + '" target="_blank" rel="noopener">Ver cardápio</a><button class="btn sm ghost" data-act="abrir-senha">Trocar senha</button><button class="btn sm ghost" data-act="sair">Sair</button></div>';
  const novos = S.pedidos.filter(p => p.status === 'novo').length + S.chamados.length;
  const prontas = S.pedidos.filter(p => p.tipo === 'delivery' && p.status === 'pronto').length;
  $('#pro-tabs').innerHTML = abas().map(t => '<button role="tab" data-act="aba" data-t="' + t[0] + '" aria-selected="' + (S.aba === t[0]) + '">' + t[1] + (t[0] === 'pedidos' && novos ? '<span class="cnt">' + novos + '</span>' : '') + (t[0] === 'entregas' && prontas ? '<span class="cnt">' + prontas + '</span>' : '') + '</button>').join('');
}
async function render(){
  renderHead();
  const f = { pedidos: renderPedidos, entregas: renderEntregas, produtos: renderProdutos, hist: renderHist, mapa: renderMapa, mesas: renderMesas, equipe: renderEquipe, config: renderConfig }[S.aba];
  if (f) await f();
}

/* ---------- exportar para Excel ---------- */
async function exportarExcel(btn){
  btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Gerando planilha…';
  try {
    const r = await fetch('/api/painel/exportar?periodo=' + encodeURIComponent(S.hp), { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok){ const d = await r.json().catch(() => ({})); throw new Error(d.erro || 'Não foi possível gerar a planilha.'); }
    const blob = await r.blob(), nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'pedidos.xlsx';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); toast('Planilha baixada: ' + nome);
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = txt;
}

/* ---------- impressora térmica e WhatsApp ---------- */
// A impressora é deste computador, então a escolha fica salva só nele
function salvarImp(){ guardar.gravar('painel:impressora', S.imp); }
async function imprimirPedido(p, auto){
  if (auto && S.impressos.has(p._id)) return; // não imprime duas vezes sozinho
  S.impressos.add(p._id); guardar.gravar('painel:impressos', [...S.impressos].slice(-300));
  await Cupom.imprimir(p, S.rest, S.imp.largura);
}
function painelImp(){
  if (!S.impAberta) return '';
  return '<div class="card imp"><div class="grid2"><div><label for="imp-larg">Largura do papel</label><select id="imp-larg"><option value="80"' + (S.imp.largura === 80 ? ' selected' : '') + '>80 mm (mais comum)</option><option value="58"' + (S.imp.largura === 58 ? ' selected' : '') + '>58 mm (mini)</option></select></div>' +
    '<div><label>Impressão automática</label><label class="ck" for="imp-auto" style="font-weight:600"><input type="checkbox" id="imp-auto"' + (S.imp.auto ? ' checked' : '') + '> Imprimir sozinho cada pedido novo neste computador</label></div></div>' +
    '<p class="note">Funciona com qualquer impressora térmica instalada no computador (Elgin, Bematech, Epson, Daruma...). Deixe-a como impressora padrão. Para sair direto, sem a janela de impressão, abra o painel pelo atalho do Chrome com <code>--kiosk-printing</code> (passo a passo no README).</p>' +
    '<div class="row" style="margin:0"><button class="btn sm ghost" data-act="imp-teste">Imprimir cupom de teste</button><button class="btn sm ghost" data-act="imp-fechar">Fechar</button></div></div>';
}
const soNumeros = t => String(t || '').replace(/\D/g, '');
function linkWhats(p){
  let n = soNumeros(p.cliente && p.cliente.tel); if (n.length < 10) return '';
  if (n.length <= 11) n = '55' + n;
  const nome = String((p.cliente && p.cliente.nome) || '').split(' ')[0], r = S.rest.nome, k = '#' + p.numero;
  const txt = {
    novo: 'Olá, ' + nome + '! Recebemos seu pedido ' + k + ' no ' + r + '. Já vamos começar a preparar.',
    preparo: 'Olá, ' + nome + '! Seu pedido ' + k + ' do ' + r + ' está sendo preparado.',
    pronto: p.tipo === 'delivery' ? 'Olá, ' + nome + '! Seu pedido ' + k + ' do ' + r + ' está pronto e já vai sair para entrega.' : 'Olá, ' + nome + '! Seu pedido ' + k + ' do ' + r + ' está pronto para retirar.',
    rota: 'Olá, ' + nome + '! Seu pedido ' + k + ' do ' + r + ' saiu para entrega' + (p.entregador ? ' com ' + p.entregador.nome : '') + '.',
    entregue: 'Obrigado por pedir no ' + r + ', ' + nome + '! Bom apetite.'
  }[p.status] || 'Olá, ' + nome + '! Aqui é do ' + r + ', sobre o seu pedido ' + k + '.';
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(txt);
}

/* ---------- pedidos (cozinha e dono) ---------- */
const ender = p => p.entrega ? p.entrega.endereco + (p.entrega.complemento ? ', ' + p.entrega.complemento : '') + ' · ' + p.entrega.bairro : '';
const onde = p => p.tipo === 'mesa' ? 'Mesa ' + pad(p.mesa) : p.tipo === 'delivery' ? 'Entrega · ' + esc(p.entrega && p.entrega.bairro) : 'Retirada';
function pagBadge(p){ const g = p.pagamento; if (g.pago) return '<span class="badge b-good">Pago' + (g.metodo === 'pix' ? ' · Pix' : g.metodo === 'online' ? ' pelo site' : '') + '</span>'; if (g.metodo === 'pix') return '<span class="badge b-warn">Pix a confirmar</span>'; return '<span class="badge ' + (p.tipo === 'delivery' ? 'b-warn' : 'b-neu') + '">' + (p.tipo === 'delivery' ? 'Cobrar ' + brl(p.total) + ' · ' : '') + esc(pagTxt(p)) + '</span>'; }
function cartao(p, modo){
  const fresh = !S.vistos.has(p._id), dl = p.tipo === 'delivery', dono = S.eu.papel === 'dono';
  let acao = '';
  if (modo === 'ent'){
    acao = p.status === 'pronto' ? '<button class="btn sm" data-act="pegar" data-id="' + p._id + '">Pegar e sair para entrega</button>' : '<button class="btn sm" data-act="status" data-s="entregue" data-id="' + p._id + '">Confirmar entrega</button>';
  } else if (p.status === 'novo') acao = '<button class="btn sm" data-act="status" data-s="preparo" data-id="' + p._id + '">Começar preparo</button>';
  else if (p.status === 'preparo') acao = '<button class="btn sm" data-act="status" data-s="pronto" data-id="' + p._id + '">Marcar como pronto</button>';
  else if (p.status === 'pronto' && dl) acao = S.entregadores.length ? '<div class="ent-sel"><select id="ent-' + p._id + '" aria-label="Entregador">' + S.entregadores.map(x => '<option value="' + x.id + '">' + esc(x.nome) + '</option>').join('') + '</select><button class="btn sm" data-act="despachar" data-id="' + p._id + '">Saiu para entrega</button></div>' : '<span class="note" style="margin:0">Cadastre um entregador na aba Equipe.</span>';
  else if (p.status === 'pronto') acao = '<button class="btn sm" data-act="status" data-s="entregue" data-id="' + p._id + '">' + (p.tipo === 'retirada' ? 'Retirado' : 'Servido') + '</button>';
  else if (p.status === 'rota') acao = '<button class="btn sm ghost" data-act="status" data-s="entregue" data-id="' + p._id + '">Confirmar entrega</button>';
  const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ender(p));
  const pixPend = p.pagamento.metodo === 'pix' && !p.pagamento.pago;
  return '<div class="ord' + (fresh ? ' fresh' : '') + '"><div class="ord-h"><strong>#' + p.numero + ' · ' + onde(p) + '</strong><span>' + hora(p.createdAt) + ' · ' + ago(p.createdAt) + '</span></div>' +
    '<div class="note" style="margin:0">' + esc(p.cliente && p.cliente.nome) + (p.cliente && p.cliente.tel ? ' · ' + esc(p.cliente.tel) : '') + (p.cliente && p.cliente.cpf ? ' · CPF ' + esc(p.cliente.cpf) : '') + '</div>' +
    (dl ? '<div class="addr' + (modo === 'ent' ? ' big-addr' : '') + '">' + esc(ender(p)) + (p.entrega.referencia ? '<br><small>Ref.: ' + esc(p.entrega.referencia) + '</small>' : '') + (modo === 'ent' ? '<br><a href="' + esc(maps) + '" target="_blank" rel="noopener">Abrir no mapa</a>' : '') + '</div>' : '') +
    (modo === 'ent' ? '' : '<ul>' + p.linhas.map(l => '<li><strong>' + l.qtd + '×</strong> ' + esc(l.nome) + (l.opcoes.length ? ' <small>— ' + esc(l.opcoes.join(', ')) + '</small>' : '') + '</li>').join('') + '</ul>') +
    (p.obs ? '<div class="obs">Obs: ' + esc(p.obs) + '</div>' : '') +
    (p.status === 'rota' && modo !== 'ent' && p.entregador ? '<div class="note" style="margin:0">Com <strong>' + esc(p.entregador.nome) + '</strong></div>' : '') +
    (trocoTxt(p) ? '<div class="note" style="margin:0;font-weight:600">' + esc(trocoTxt(p)) + '</div>' : '') +
    '<div class="row" style="margin:0;justify-content:space-between">' + pagBadge(p) + acao + '</div>' +
    '<div class="row" style="margin:0;gap:2px 14px">' +
      (S.eu.papel !== 'entregador' ? '<button class="mini" data-act="imprimir" data-id="' + p._id + '">Imprimir</button>' : '') +
      (linkWhats(p) ? '<a class="mini" href="' + esc(linkWhats(p)) + '" target="_blank" rel="noopener">WhatsApp do cliente</a>' : '') +
      (pixPend && S.eu.papel !== 'entregador' ? '<button class="mini" data-act="pago" data-id="' + p._id + '">Confirmar Pix recebido</button>' : '') +
      (dono && modo !== 'ent' && p.status !== 'rota' ? '<button class="mini danger" data-act="cancelar" data-id="' + p._id + '">' + (S.confirmar === 'c' + p._id ? 'Confirmar cancelamento' : 'Cancelar pedido') + '</button>' : '') + '</div></div>';
}
function renderPedidos(){
  const KF = S.kf;
  const lista = S.pedidos.filter(p => KF === 'todos' || p.tipo === KF).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const col = (st, t) => { const l = lista.filter(p => p.status === st); return '<div class="col"><h3>' + t + ' <span>' + l.length + '</span></h3>' + (l.map(p => cartao(p)).join('') || '<p class="note" style="padding:4px">Nada por aqui.</p>') + '</div>'; };
  const mostraRota = KF === 'todos' || KF === 'delivery';
  const chips = [['todos', 'Todos'], ['delivery', 'Entrega'], ['retirada', 'Retirada'], ['mesa', 'Mesas']].map(o => '<button class="chip" data-act="kf" data-k="' + o[0] + '" aria-pressed="' + (KF === o[0]) + '">' + o[1] + ' · ' + S.pedidos.filter(p => o[0] === 'todos' || p.tipo === o[0]).length + '</button>').join('');
  $('#pane').innerHTML = '<div class="kbar"><div class="chips">' + chips + '</div><div class="row" style="margin:0;align-items:center"><span class="note" style="margin:0">' + S.finalizadosHoje + ' pedidos finalizados hoje</span><button class="btn sm ghost" data-act="imp-abrir" aria-expanded="' + S.impAberta + '">Impressora' + (S.imp.auto ? ' · automática' : '') + '</button></div></div>' + painelImp() +
    (S.chamados.length && (KF === 'todos' || KF === 'mesa') ? '<div class="calls">' + S.chamados.map(c => '<div class="call"><span>Mesa ' + pad(c.mesa) + (c.tipo === 'conta' ? ' pediu a conta' : ' chamou o garçom') + ' · ' + ago(c.createdAt) + '</span><button class="btn sm ghost" data-act="atendido" data-id="' + c._id + '">Atendido</button></div>').join('') + '</div>' : '') +
    '<div class="kan" style="--cols:' + (mostraRota ? 4 : 3) + '">' + col('novo', 'Novos') + col('preparo', 'Em preparo') + col('pronto', 'Prontos') + (mostraRota ? col('rota', 'Em entrega') : '') + '</div>';
  setTimeout(() => lista.forEach(p => S.vistos.add(p._id)), 2500);
}
function renderEntregas(){
  const prontas = S.pedidos.filter(p => p.tipo === 'delivery' && p.status === 'pronto');
  const minhas = S.pedidos.filter(p => p.tipo === 'delivery' && p.status === 'rota' && p.entregador && String(p.entregador.id) === String(S.eu.id));
  const cobrar = minhas.filter(p => !p.pagamento.pago).reduce((a, p) => a + p.total, 0);
  $('#pane').innerHTML = '<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:520px"><div class="kpi"><span>Com você agora</span><strong>' + minhas.length + '</strong></div><div class="kpi"><span>A cobrar nas entregas</span><strong>' + brl(cobrar) + '</strong></div></div>' +
    '<h3>Com você agora</h3>' + (minhas.map(p => cartao(p, 'ent')).join('') || '<p class="note">Nenhuma entrega com você.</p>') +
    '<h3>Prontas para sair</h3>' + (prontas.map(p => cartao(p, 'ent')).join('') || '<p class="note">Nada pronto agora. Quando a cozinha marcar como pronto, aparece aqui e o celular apita.</p>');
  setTimeout(() => prontas.concat(minhas).forEach(p => S.vistos.add(p._id)), 2500);
}
async function mudarStatus(id, status, extra){
  try { const d = await chamar('PATCH', '/api/painel/pedidos/' + id + '/status', Object.assign({ status }, extra || {})); upsert(d.pedido); atualizarAbas(); }
  catch (e) { toast(e.message); if (e.status === 409) carregarPedidos().then(atualizarAbas); }
}

/* ---------- produtos ---------- */
async function renderProdutos(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { S.produtos = (await chamar('GET', '/api/painel/produtos')).produtos; } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  if (S.eu.papel === 'dono' && !S.config) { try { S.config = (await chamar('GET', '/api/painel/restaurante')).restaurante; } catch (e) {} }
  desenharProdutos();
}
function categorias(){ const c = (S.config && S.config.categorias) || []; return c.concat([...new Set(S.produtos.map(p => p.categoria))].filter(x => !c.includes(x))); }
function desenharProdutos(){
  const dono = S.eu.papel === 'dono', p = S.editId ? S.produtos.find(x => x._id === S.editId) : null;
  const cats = categorias();
  const topo = '<div class="row between" style="margin-top:0"><span class="note" style="margin:0">' + S.produtos.length + ' produtos · ' + S.produtos.filter(x => x.esgotado).length + ' esgotados</span>' + (dono && !S.formAberto && !p ? '<button class="btn sm" data-act="novo-prod">+ Novo produto</button>' : '') + '</div>';
  let form = '';
  if (dono && (S.formAberto || p)){
    const um = p ? p.opcoes.find(o => o.tipo === 'um') : null, va = p ? p.opcoes.find(o => o.tipo === 'varios') : null;
    const ch = e => e.nome + (e.preco ? ' | ' + e.preco : '');
    form = '<h3>' + (p ? 'Editar produto' : 'Novo produto') + '</h3><form id="f-prod" class="card" novalidate>' +
      '<div class="grid2"><div><label for="p-nome">Nome</label><input id="p-nome" value="' + esc(p ? p.nome : '') + '" placeholder="Ex.: Feijoada da casa"></div><div><label for="p-preco">Preço (R$)</label><input id="p-preco" type="number" step="0.01" min="0" value="' + (p ? p.preco : '') + '"></div></div>' +
      '<label for="p-desc">Descrição</label><input id="p-desc" value="' + esc(p ? p.descricao : '') + '" placeholder="Ingredientes, porção, acompanhamentos">' +
      '<div class="grid2"><div><label for="p-cat">Categoria</label><select id="p-cat">' + cats.map(c => '<option' + (p && p.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '<option value="__nova">+ Nova categoria…</option></select></div><div id="p-novacat-w"' + (cats.length ? ' hidden' : '') + '><label for="p-novacat">Nome da nova categoria</label><input id="p-novacat" placeholder="Ex.: Porções"></div></div>' +
      '<label for="p-foto">Endereço da foto (opcional)</label><input id="p-foto" value="' + esc(p ? p.fotoUrl : '') + '" placeholder="https://… (link de uma imagem já publicada)">' +
      '<label>Selos</label><div class="checks">' + SELOS.map((s, i) => '<label for="p-s' + i + '"><input type="checkbox" id="p-s' + i + '" data-selo="' + s + '"' + (p && p.selos.includes(s) ? ' checked' : '') + '> ' + s + '</label>').join('') + '<label for="p-dest"><input type="checkbox" id="p-dest"' + (p && p.destaque ? ' checked' : '') + '> Destaque da casa</label></div>' +
      '<div class="grid2"><div><label for="p-o1t">Escolha obrigatória (título)</label><input id="p-o1t" placeholder="Ex.: Ponto da carne" value="' + esc(um ? um.nome : '') + '"></div><div><label for="p-o1c">Opções, separadas por vírgula</label><input id="p-o1c" placeholder="Mal passada, Ao ponto, Bem passada" value="' + esc(um ? um.escolhas.map(ch).join(', ') : '') + '"></div></div>' +
      '<label for="p-add">Adicionais pagos (um por linha: Nome | preço)</label><textarea id="p-add" rows="3" placeholder="Ovo frito | 4&#10;Queijo coalho | 9">' + esc(va ? va.escolhas.map(ch).join('\n') : '') + '</textarea>' +
      '<div class="row"><button class="btn" type="submit">' + (p ? 'Salvar alterações' : 'Adicionar ao cardápio') + '</button><button class="btn ghost" type="button" data-act="cancelar-prod">Cancelar</button></div></form><h3>Produtos no cardápio</h3>';
  }
  const lista = cats.map((c, ci) => { const l = S.produtos.filter(x => x.categoria === c); if (!l.length) return '';
    return '<p class="table-tag" style="margin:16px 0 0">' + esc(c) + '</p>' + l.map(x => '<div class="adm-item"><div class="ph">' + foto(x, ci) + '</div><div><strong>' + esc(x.nome) + '</strong>' +
      (dono ? '<div class="pr-row"><label class="pr-l" for="pr' + x._id + '">R$</label><input class="pr-in" id="pr' + x._id + '" type="number" step="0.01" min="0" data-preco="' + x._id + '" value="' + x.preco + '" aria-label="Preço de ' + esc(x.nome) + '"></div>' : '<div class="price">' + brl(x.preco) + '</div>') +
      '<small>' + (x.esgotado ? 'Esgotado' : 'Disponível') + (x.destaque ? ' · Destaque' : '') + (x.opcoes.length ? ' · com opções' : '') + '</small></div><div class="row">' +
      (dono ? '<button class="btn sm ghost" data-act="editar-prod" data-id="' + x._id + '">Editar</button>' : '') +
      '<button class="btn sm ghost" data-act="esgotar" data-id="' + x._id + '">' + (x.esgotado ? 'Disponível' : 'Esgotar') + '</button>' +
      (dono ? '<button class="btn sm ' + (S.confirmar === 'p' + x._id ? 'danger' : 'ghost') + '" data-act="remover-prod" data-id="' + x._id + '">' + (S.confirmar === 'p' + x._id ? 'Confirmar remoção' : 'Remover') + '</button>' : '') + '</div></div>').join(''); }).join('');
  $('#pane').innerHTML = topo + form + (dono ? '<p class="note">Altere o preço direto na lista. As mudanças valem na hora para os próximos pedidos.</p>' : '<p class="note">Marque como esgotado o que acabou. O cardápio dos clientes deixa de oferecer na hora.</p>') + lista;
}
function escolhas(str, sep){ return String(str || '').split(sep).map(s => s.trim()).filter(Boolean).map(s => { const a = s.split('|'); return { nome: a[0].trim(), preco: Math.max(0, parseFloat(String(a[1] || '0').replace(',', '.')) || 0) }; }).filter(e => e.nome); }
async function salvarProduto(e){
  e.preventDefault();
  let cat = $('#p-cat').value; if (cat === '__nova' || !cat) cat = $('#p-novacat').value.trim();
  const opcoes = []; const t1 = $('#p-o1t').value.trim(), c1 = escolhas($('#p-o1c').value, ',');
  if (t1 && c1.length) opcoes.push({ nome: t1, tipo: 'um', escolhas: c1 });
  const ad = escolhas($('#p-add').value, /\n/); if (ad.length) opcoes.push({ nome: 'Adicionais', tipo: 'varios', escolhas: ad });
  const atual = S.editId ? S.produtos.find(x => x._id === S.editId) : null;
  const corpo = { nome: $('#p-nome').value, preco: $('#p-preco').value, descricao: $('#p-desc').value, categoria: cat, fotoUrl: $('#p-foto').value,
    selos: $$('#f-prod [data-selo]').filter(x => x.checked).map(x => x.dataset.selo), destaque: $('#p-dest').checked, esgotado: atual ? atual.esgotado : false, opcoes };
  try {
    if (S.editId) await chamar('PUT', '/api/painel/produtos/' + S.editId, corpo); else await chamar('POST', '/api/painel/produtos', corpo);
    toast(S.editId ? 'Produto atualizado' : 'Produto adicionado ao cardápio');
    if (S.config && cat && !S.config.categorias.includes(cat)) S.config.categorias.push(cat);
    S.editId = null; S.formAberto = false; renderProdutos();
  } catch (err) { toast(err.message); }
}

/* ---------- mesas e QR ---------- */
function qrSvg(texto){
  if (typeof qrcode !== 'function') return '<p class="note">QR indisponível.</p>';
  const q = qrcode(0, 'M'); q.addData(texto, 'Byte'); q.make(); const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + 3) + ' ' + (r + 3) + 'h1v1h-1z';
  return '<svg class="qr" viewBox="0 0 ' + (n + 6) + ' ' + (n + 6) + '" role="img" aria-label="QR Code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="' + d + '" fill="#111111"/></svg>';
}
async function renderMesas(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { S.mesas = (await chamar('GET', '/api/painel/mesas')).mesas; } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  const base = location.origin + '/r/' + S.rest.slug;
  $('#pane').innerHTML = '<h3>Link do delivery</h3><div class="card dlink"><div class="qrc">' + qrSvg(base) + '<strong>Peça pelo site</strong><span>' + esc(S.rest.nome) + '</span></div><div style="flex:1;min-width:0"><p style="margin:0 0 6px">Coloque este link na bio do Instagram, no WhatsApp Business, no Google e nos panfletos.</p><div class="code" id="dl-link">' + esc(base) + '</div><div class="row"><button class="btn sm" data-act="copiar" data-v="' + esc(base) + '">Copiar link</button></div></div></div>' +
    '<h3>QR Codes das mesas</h3><div class="card"><div class="row" style="margin:0;align-items:flex-end"><div><label for="m-qtd" style="margin-top:0">Quantidade de mesas</label><input id="m-qtd" type="number" min="1" max="200" value="' + (S.mesas.length || 10) + '" style="width:120px"></div><button class="btn sm" data-act="salvar-mesas">Atualizar mesas</button></div>' +
    '<p class="note">Cada QR leva um código secreto da mesa: só quem está no restaurante consegue pedir por ela. Se um QR for copiado ou fotografado, gere um novo código e imprima de novo. Para imprimir, use Ctrl+P no computador.</p></div>' +
    '<div class="qrs">' + S.mesas.map(m => { const url = base + '/mesa/' + m.numero + '?t=' + encodeURIComponent(m.token); return '<div class="qrc">' + qrSvg(url) + '<strong>Mesa ' + pad(m.numero) + '</strong><span>' + esc(S.rest.nome) + '</span><span>Aponte a câmera para ver o cardápio e pedir</span>' +
      '<div class="row" style="justify-content:center;margin-top:8px"><button class="mini" data-act="copiar" data-v="' + esc(url) + '">Copiar link</button><button class="mini' + (S.confirmar === 'm' + m.numero ? ' danger' : '') + '" data-act="novo-codigo" data-n="' + m.numero + '">' + (S.confirmar === 'm' + m.numero ? 'Confirmar: o QR antigo para de funcionar' : 'Gerar novo código') + '</button></div></div>'; }).join('') + '</div>';
}

/* ---------- equipe ---------- */
async function renderEquipe(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { S.equipe = (await chamar('GET', '/api/painel/equipe')).equipe; } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  $('#pane').innerHTML = '<h3>Quem acessa o painel</h3><div class="card">' + S.equipe.map(u => '<div class="eq"><div><strong>' + esc(u.nome) + '</strong> <span class="badge b-neu">' + PAPEL[u.papel] + '</span><br><small>' + esc(u.email) + '</small></div>' +
    (String(u.id) === String(S.eu.id) ? '<small>Você</small>' : '<div class="row" style="margin:0"><button class="btn sm ghost" data-act="nova-senha" data-id="' + u.id + '">Nova senha</button><button class="btn sm ' + (S.confirmar === 'u' + u.id ? 'danger' : 'ghost') + '" data-act="remover-user" data-id="' + u.id + '">' + (S.confirmar === 'u' + u.id ? 'Confirmar remoção' : 'Remover') + '</button></div>') + '</div>' +
      (S.senhaPara === u.id ? '<form class="eq-senha row" data-uid="' + u.id + '" novalidate style="margin:0 0 12px"><label class="sr" for="ns-' + u.id + '">Nova senha para ' + esc(u.nome) + '</label><input id="ns-' + u.id + '" type="text" autocomplete="new-password" placeholder="Nova senha (mínimo 8)" style="flex:1;min-width:180px"><button class="btn sm" type="submit">Salvar</button><button class="btn sm ghost" type="button" data-act="nova-senha" data-id="">Cancelar</button></form>' : '')).join('') + '</div>' +
    '<p class="note">Cozinha: vê e avança pedidos e marca produtos esgotados. Entregador: só vê as entregas. Dono: acesso completo.</p>' +
    '<h3>Adicionar pessoa</h3><form id="f-user" class="card" novalidate><div class="grid2"><div><label for="u-nome">Nome</label><input id="u-nome" placeholder="Ex.: Carlos"></div><div><label for="u-papel">Função</label><select id="u-papel"><option value="cozinha">Cozinha</option><option value="entregador">Entregador</option><option value="dono">Dono (acesso completo)</option></select></div>' +
    '<div><label for="u-email">E-mail</label><input id="u-email" type="email" autocomplete="off"></div><div><label for="u-senha">Senha (mínimo 8 caracteres)</label><input id="u-senha" type="text" autocomplete="new-password"></div></div><div class="row"><button class="btn" type="submit">Adicionar</button></div></form>';
}

/* ---------- configurações ---------- */
async function renderConfig(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { S.config = (await chamar('GET', '/api/painel/restaurante')).restaurante; } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  const c = S.config, d = c.delivery;
  const inp = (id, lab, v, extra) => '<div><label for="' + id + '">' + lab + '</label><input id="' + id + '" value="' + esc(v) + '"' + (extra || '') + '></div>';
  $('#pane').innerHTML = '<form id="f-config" novalidate><h3>Identidade</h3><div class="card"><div class="grid2">' + inp('c-nome', 'Nome do restaurante', c.nome) + inp('c-frase', 'Frase curta', c.frase) +
    '<div><label for="c-cor">Cor principal</label><input id="c-cor" type="color" value="' + esc(c.cor) + '"></div>' + inp('c-logo', 'Endereço do logo (opcional)', c.logoUrl, ' placeholder="https://…"') + inp('c-capa', 'Foto de capa do site (endereço)', c.capaUrl, ' placeholder="https://…"') + '</div>' +
    '<label for="c-sobre">Sobre o restaurante (aparece no site)</label><textarea id="c-sobre" rows="3" maxlength="400">' + esc(c.sobre || '') + '</textarea>' +
    '<p class="note">Endereço do cardápio: ' + esc(location.origin + '/r/' + c.slug) + '</p></div>' +
    '<h3>Funcionamento</h3><div class="card"><div class="grid2">' + inp('c-abre', 'Abre às', c.abre, ' type="time"') + inp('c-fecha', 'Fecha às', c.fecha, ' type="time"') + inp('c-serv', 'Taxa de serviço na mesa (%)', c.taxaServico, ' type="number" min="0" max="30"') + inp('c-whats', 'WhatsApp do restaurante', c.whatsapp, ' inputmode="tel"') + inp('c-pix', 'Chave Pix (aparece para o cliente pagar)', c.chavePix) + '</div>' +
    '<div class="checks"><label for="c-fora"><input type="checkbox" id="c-fora"' + (c.aceitarForaDoHorario ? ' checked' : '') + '> Aceitar pedidos fora do horário (use só para testes)</label></div>' +
    '<label for="c-cats">Ordem das categorias no cardápio (uma por linha)</label><textarea id="c-cats" rows="4">' + esc((c.categorias || []).join('\n')) + '</textarea></div>' +
    '<h3>Delivery</h3><div class="card">' + (c.recursos && c.recursos.delivery === false ? '<p class="warnbox" style="margin-top:0">O delivery não está incluído no plano deste restaurante. Fale com o suporte para ativar.</p>' : '') + '<div class="checks"><label for="c-dat"><input type="checkbox" id="c-dat"' + (d.ativo ? ' checked' : '') + (c.recursos && c.recursos.delivery === false ? ' disabled' : '') + '> Delivery ativo</label></div><div class="grid2">' + inp('c-tempo', 'Tempo de entrega', d.tempo) + inp('c-tret', 'Tempo para retirada', d.tempoRetirada) +
    inp('c-min', 'Pedido mínimo para entrega (R$)', d.pedidoMinimo, ' type="number" min="0"') + inp('c-gratis', 'Entrega grátis acima de (R$, 0 = nunca)', d.gratisAcimaDe, ' type="number" min="0"') + '</div>' +
    '<label for="c-bairros">Bairros atendidos e taxa (um por linha: Bairro | taxa)</label><textarea id="c-bairros" rows="5">' + esc(d.bairros.map(b => b.nome + ' | ' + b.taxa).join('\n')) + '</textarea></div>' +
    '<div class="row"><button class="btn" type="submit">Salvar configurações</button></div></form>';
}
async function salvarConfig(e){
  e.preventDefault();
  const v = id => $('#' + id).value;
  const corpo = { capaUrl: v('c-capa'), sobre: v('c-sobre'), nome: v('c-nome'), frase: v('c-frase'), cor: v('c-cor'), logoUrl: v('c-logo'), abre: v('c-abre'), fecha: v('c-fecha'), taxaServico: v('c-serv'), whatsapp: v('c-whats'), chavePix: v('c-pix'),
    aceitarForaDoHorario: $('#c-fora').checked, categorias: v('c-cats').split('\n').map(s => s.trim()).filter(Boolean),
    delivery: { ativo: $('#c-dat').checked, tempo: v('c-tempo'), tempoRetirada: v('c-tret'), pedidoMinimo: v('c-min'), gratisAcimaDe: v('c-gratis'), bairros: escolhas(v('c-bairros'), /\n/).map(x => ({ nome: x.nome, taxa: x.preco })) } };
  try { S.config = (await chamar('PUT', '/api/painel/restaurante', corpo)).restaurante; S.rest.nome = S.config.nome; S.rest.cor = S.config.cor; S.rest.logoUrl = S.config.logoUrl; aplicarCor(S.config.cor); renderHead(); toast('Configurações salvas'); }
  catch (err) { toast(err.message); }
}

/* ---------- histórico e financeiro ---------- */
const PER = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['tudo', 'Tudo']];
const pct = v => (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
const short = v => v >= 1000 ? 'R$ ' + (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' mil' : 'R$ ' + Math.round(v);
const dataCurta = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const quando = t => dataCurta(t) + ' ' + hora(t);
function perChips(){ return '<div class="chips" role="group" aria-label="Período">' + PER.map(o => '<button class="chip" data-act="hp" data-p="' + o[0] + '" aria-pressed="' + (S.hp === o[0]) + '">' + o[1] + '</button>').join('') + '</div>'; }
function perLabel(d){ if (!d || !d.inicio) return 'Sem pedidos ainda'; return d.periodo === 'hoje' ? 'Hoje, ' + dataCurta(d.fim) : dataCurta(d.inicio) + ' a ' + dataCurta(d.fim); }
async function carregarRel(){ S.rel = await chamar('GET', '/api/painel/relatorios?periodo=' + S.hp); return S.rel; }

function balanco(x, canal){
  const F = S.rel.premissas;
  const bruta = x.prod + x.serv + x.ent, cmv = x.prod * F.cmv / 100, tx = x.tot_pix * F.pix / 100 + x.tot_cartao * F.cartao / 100;
  const rep = x.serv * F.rep / 100, emb = canal === 'delivery' ? x.n * F.emb : 0, eg = canal === 'delivery' ? x.n * F.entreg : 0;
  return Object.assign({}, x, { bruta, cmv, tx, rep, emb, eg, res: bruta - cmv - tx - rep - emb - eg });
}
function balCard(t, sub, b, c){
  const F = S.rel.premissas;
  const L = (k, v, neg, cls) => '<div class="bl' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span>' + (neg && v ? '− ' : '') + brl(v) + '</span></div>';
  return '<div class="card bal"><div class="bal-h"><div><strong>' + t + '</strong><span class="note" style="margin:0;display:block">' + sub + '</span></div><span class="badge b-neu">' + b.n + ' pedidos</span></div>' +
    '<p class="bal-sec">Entradas</p>' + L('Vendas de produtos', b.prod) + (c === 'rest' ? L('Taxa de serviço', b.serv) : L('Taxas de entrega cobradas', b.ent)) + L('Receita bruta', b.bruta, false, 'sum') +
    '<p class="bal-sec">Saídas estimadas</p>' + L('Custo dos produtos (' + pct(F.cmv) + ')', b.cmv, true) + L('Taxas de cartão e Pix', b.tx, true) +
    (c === 'rest' ? L('Repasse da taxa de serviço', b.rep, true) : L('Embalagens', b.emb, true) + L('Pagamento dos entregadores', b.eg, true)) +
    '<div class="bl res ' + (b.res >= 0 ? 'pos' : 'neg') + '"><span>Resultado estimado</span><span>' + brl(b.res) + '</span></div>' +
    '<p class="note">Margem de ' + pct(b.bruta ? b.res / b.bruta * 100 : 0) + ' · ticket médio ' + brl(b.n ? b.bruta / b.n : 0) + '</p></div>';
}
function renderBal(){
  const r = balanco(S.rel.canais.rest, 'rest'), d = balanco(S.rel.canais.delivery, 'delivery');
  $('#bal').innerHTML = balCard('Restaurante', 'Mesas e retirada no balcão', r, 'rest') + balCard('Delivery', 'Pedidos entregues em casa', d, 'delivery');
  const tot = r.res + d.res, bru = r.bruta + d.bruta, sh = bru ? d.bruta / bru * 100 : 0;
  $('#k-res').textContent = brl(tot); $('#k-mar').textContent = 'margem de ' + pct(bru ? tot / bru * 100 : 0);
  $('#k-split').innerHTML = '<span class="split"><span class="s1" style="width:' + (100 - sh) + '%"></span><span class="s2" style="width:' + sh + '%"></span></span><span class="note" style="margin:4px 0 0;display:block"><i class="lg s1"></i>Restaurante ' + pct(100 - sh) + ' · <i class="lg s2"></i>Delivery ' + pct(sh) + '</span>';
}
function niceMax(raw){ const st = raw > 20000 ? 5000 : raw > 8000 ? 2000 : raw > 3000 ? 1000 : raw > 1000 ? 500 : raw > 400 ? 200 : 100; return Math.max(st, Math.ceil(raw / st) * st); }
function grafico(d){
  if (!d.serie.length) return '<p class="note">Sem pedidos no período.</p>';
  let b = [];
  if (d.granularidade === 'hora'){
    const hs = d.serie.map(x => x.chave); let a = Math.min(...hs), z = Math.max(...hs); while (z - a < 5){ if (a > 0) a--; else z++; }
    const m = new Map(d.serie.map(x => [x.chave, x]));
    for (let h = a; h <= z; h++){ const x = m.get(h) || { r: 0, d: 0, n: 0 }; b.push({ lab: pad(h) + 'h', tip: pad(h) + 'h', r: x.r, d: x.d, n: x.n }); }
  } else {
    const m = new Map(d.serie.map(x => [x.chave, x]));
    const ini = new Date(d.inicio), fim = new Date(d.fim);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: d.fuso, year: 'numeric', month: '2-digit', day: '2-digit' });
    const vistos = new Set();
    for (let t = ini.getTime(); t <= fim.getTime() + 3600000; t += 3600000 * 6){
      const k = fmt.format(new Date(t)); if (vistos.has(k)) continue; vistos.add(k);
      const x = m.get(k) || { r: 0, d: 0, n: 0 }; const dd = new Date(k + 'T12:00:00');
      b.push({ lab: dd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), tip: dd.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }), r: x.r, d: x.d, n: x.n });
    }
  }
  const vmax = niceMax(Math.max(1, ...b.map(x => x.r + x.d))), every = Math.ceil(b.length / 10);
  return '<div class="legend"><span><i class="lg s1"></i>Restaurante</span><span><i class="lg s2"></i>Delivery</span></div><div class="vchart"><div class="vc-y"><span>' + short(vmax) + '</span><span>' + short(vmax / 2) + '</span><span>R$ 0</span></div><div class="vc-plot">' +
    b.map((x, i) => { const segs = []; if (x.d) segs.push('<span class="sg s2" style="height:' + (x.d / vmax * 100) + '%"></span>'); if (x.r) segs.push('<span class="sg s1" style="height:' + (x.r / vmax * 100) + '%"></span>'); if (segs.length) segs[0] = segs[0].replace('class="sg ', 'class="sg top ');
      return '<div class="vc-col" tabindex="0" data-tip="' + x.tip + ': ' + brl(x.r + x.d) + ' em ' + x.n + ' pedidos · Restaurante ' + brl(x.r) + ' · Delivery ' + brl(x.d) + '"><span class="stk">' + segs.join('') + '</span><span class="vc-x">' + (i % every === 0 ? x.lab : '') + '</span></div>'; }).join('') + '</div></div>';
}
async function renderHist(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  let d; try { d = await carregarRel(); } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  const n = d.canais.rest.n + d.canais.delivery.n, fat = d.canais.rest.total + d.canais.delivery.total, npix = d.canais.rest.n_pix + d.canais.delivery.n_pix;
  const tmax = Math.max(1, ...d.top.map(r => r.q)), F = d.premissas;
  const fin = (k, lab, step) => '<div><label for="fin-' + k + '">' + lab + '</label><input id="fin-' + k + '" type="number" min="0" step="' + step + '" data-fin="' + k + '" value="' + F[k] + '"></div>';
  $('#pane').innerHTML = '<div class="kbar">' + perChips() + '<div class="row" style="margin:0;align-items:center"><span class="note" style="margin:0">' + perLabel(d) + '</span><button class="btn sm" data-act="exportar">Exportar para Excel</button></div></div>' +
    '<div class="kpis"><div class="kpi"><span>Faturamento</span><strong>' + brl(fat) + '</strong></div><div class="kpi"><span>Pedidos</span><strong>' + n + '</strong><span class="note" style="margin:2px 0 0">ticket médio ' + brl(n ? fat / n : 0) + '</span></div>' +
    '<div class="kpi"><span>Resultado estimado</span><strong id="k-res"></strong><span class="note" id="k-mar" style="margin:2px 0 0"></span></div><div class="kpi"><span>De onde vem a receita</span><div id="k-split" style="margin-top:8px"></div></div></div>' +
    '<h3>Balanço financeiro</h3><div class="bals" id="bal"></div>' +
    '<details class="card prem"' + (S.premAberta ? ' open' : '') + ' id="prem"><summary>Ajustar premissas do cálculo</summary><div class="grid3">' + fin('cmv', 'Custo dos produtos (% das vendas)', '0.5') + fin('cartao', 'Taxa do cartão (%)', '0.1') + fin('pix', 'Taxa do Pix (%)', '0.01') +
    fin('rep', 'Repasse da taxa de serviço (%)', '5') + fin('emb', 'Embalagem por pedido de entrega (R$)', '0.5') + fin('entreg', 'Pagamento por entrega (R$)', '0.5') + '</div><p class="note">O resultado é uma estimativa com base nestas premissas, que ficam salvas para o restaurante. Pedidos cancelados não entram nas contas.</p></details>' +
    '<h3>Faturamento por ' + (d.granularidade === 'hora' ? 'hora' : 'dia') + '</h3><div class="card">' + grafico(d) + '<p class="note">' + npix + ' de ' + n + ' pedidos pagos por Pix no período.</p></div>' +
    '<h3>Pratos mais vendidos</h3><div class="card">' + (d.top.length ? '<div class="hbars">' + d.top.map(r => '<div class="hb" tabindex="0" data-tip="' + esc(r.nome) + ': ' + r.q + ' vendidos · ' + brl(r.v) + '"><span class="hb-l">' + esc(r.nome) + '</span><span class="hb-track"><span class="hb-bar" style="width:' + (r.q / tmax * 100) + '%"></span></span><span class="hb-v">' + r.q + '</span></div>').join('') + '</div>' : '<p class="note">Sem vendas no período.</p>') + '</div>' +
    '<h3>Histórico de pedidos</h3><div class="kbar"><div class="chips" id="h-chips"></div><input id="h-q" type="search" placeholder="Buscar nº, cliente, bairro ou mesa" aria-label="Buscar no histórico" value="' + esc(S.hq) + '" style="max-width:300px"></div><div id="h-list"><p class="note">Carregando…</p></div>';
  renderBal(); carregarHist();
}
async function carregarHist(){
  let d; try { d = await chamar('GET', '/api/painel/historico?periodo=' + S.hp + '&canal=' + S.hc + '&limite=' + S.hn + '&q=' + encodeURIComponent(S.hq)); } catch (e) { $('#h-list').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  if (!$('#h-list')) return;
  $('#h-chips').innerHTML = [['todos', 'Todos'], ['rest', 'Restaurante'], ['delivery', 'Delivery']].map(o => '<button class="chip" data-act="hc" data-c="' + o[0] + '" aria-pressed="' + (S.hc === o[0]) + '">' + o[1] + ' · ' + d.contagem[o[0]] + '</button>').join('');
  $('#h-list').innerHTML = '<div class="card tbl" style="padding:0"><table><thead><tr><th>Pedido</th><th>Data</th><th>Canal</th><th>Cliente</th><th>Itens</th><th style="text-align:right">Total</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>' +
    (d.pedidos.map(p => '<tr><td>#' + p.numero + '</td><td>' + quando(p.createdAt) + '</td><td>' + (p.tipo === 'delivery' ? '<i class="lg s2"></i>Delivery' : '<i class="lg s1"></i>' + (p.tipo === 'mesa' ? 'Mesa ' + pad(p.mesa) : 'Retirada')) + '</td><td>' + esc(p.cliente.nome) + (p.entrega ? ' <small class="note">· ' + esc(p.entrega.bairro) + '</small>' : '') + '</td><td>' + p.itens + '</td><td style="text-align:right">' + brl(p.total) + '</td><td>' + esc(pagTxt(p)) + (p.pagamento.pago ? ' · pago' : '') + '</td><td>' + C.STATUS[p.status] + '</td></tr>').join('') || '<tr><td colspan="8" class="note">Nenhum pedido encontrado.</td></tr>') +
    '</tbody></table></div><div class="row between"><span class="note" style="margin:0">Mostrando ' + d.pedidos.length + ' de ' + d.total + ' pedidos · ' + brl(d.valor) + '</span>' + (d.total > d.pedidos.length ? '<button class="btn sm ghost" data-act="hmore">Mostrar mais</button>' : '') + '</div>';
}
let salvarFinT;
function salvarPremissas(){ clearTimeout(salvarFinT); salvarFinT = setTimeout(async () => { try { S.rel.premissas = (await chamar('PUT', '/api/painel/financeiro', S.rel.premissas)).premissas; toast('Premissas salvas'); } catch (e) { toast(e.message); } }, 700); }

/* ---------- mapa de calor das mesas ---------- */
function isDark(){ const a = document.documentElement.getAttribute('data-theme'); if (a) return a === 'dark'; try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } }
function heat(t){
  const stops = isDark() ? ['#45301F', '#7A3A19', '#B44C1D', '#E5783C', '#FFC59A'] : ['#FDEEE3', '#F8C39E', '#EF8A52', '#D2531F', '#8F2F0E'];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const h = s => [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16)); const a = h(stops[i]), b = h(stops[i + 1]);
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
}
function penta(cx, cy, R, up){ const p = []; for (let k = 0; k < 5; k++){ const a = ((up ? -90 : 90) + 72 * k) * Math.PI / 180; p.push((cx + R * Math.cos(a)).toFixed(1) + ',' + (cy + R * Math.sin(a)).toFixed(1)); } return p.join(' '); }
async function renderMapa(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  let d; try { d = await carregarRel(); } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  desenharMapa();
}
function desenharMapa(){
  const d = S.rel, st = d.mesas, met = S.hm, N = st.length;
  if (!N){ $('#pane').innerHTML = '<div class="kbar">' + perChips() + '</div><p class="note">Nenhuma mesa cadastrada. Crie as mesas na aba Mesas e QR Codes.</p>'; return; }
  const val = s => met === 'n' ? s.n : met === 'v' ? s.v : (s.n ? s.v / s.n : 0);
  const fmt = v => met === 'n' ? String(v) : v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' mil' : 'R$ ' + Math.round(v);
  const fmtL = v => met === 'n' ? v + ' pedido' + (v === 1 ? '' : 's') : brl(v);
  const vals = st.map(val), mx = Math.max(...vals), mn = Math.min(...vals);
  const tOf = v => mx > mn ? (v - mn) / (mx - mn) : (mx ? 1 : 0);
  const cols = N <= 6 ? 3 : N <= 12 ? 4 : N <= 20 ? 5 : N <= 42 ? 6 : 8, rows = Math.ceil(N / cols);
  const R = 52, p0 = 10, gap = 8, W = 2 * p0 + 1.902 * R + (cols - 1) * 1.539 * R, H = 2 * p0 + rows * 2.5 * R + (rows - 1) * gap;
  let g = '';
  st.forEach((s, i) => {
    const row = Math.floor(i / cols), col = i % cols, up = col % 2 === 0;
    const cx = p0 + 0.951 * R + col * 1.539 * R, cy = p0 + R + row * (2.5 * R + gap) + (up ? 0 : 0.5 * R);
    const v = val(s), fill = heat(tOf(v)), ink = C.lum(fill) > .3 ? '#3A1606' : '#FFFFFF', ty = cy + (up ? 0.06 * R : -0.06 * R);
    g += '<g class="pgw" tabindex="0" data-tip="Mesa ' + pad(s.numero) + ': ' + s.n + ' pedidos · ' + brl(s.v) + (s.n ? ' · ticket médio ' + brl(s.v / s.n) : '') + '"><polygon class="pg" points="' + penta(cx, cy, R, up) + '" fill="' + fill + '"/>' +
      '<text x="' + cx.toFixed(1) + '" y="' + (ty - 9).toFixed(1) + '" fill="' + ink + '" class="pg-m">Mesa ' + pad(s.numero) + '</text><text x="' + cx.toFixed(1) + '" y="' + (ty + 13).toFixed(1) + '" fill="' + ink + '" class="pg-v' + (met === 'n' ? '' : ' sm') + '">' + fmt(v) + '</text></g>';
  });
  const rank = st.slice().sort((a, b) => val(b) - val(a)), usadas = rank.filter(s => s.n);
  const quente = usadas[0], fria = usadas[usadas.length - 1], razao = quente && fria && val(fria) ? val(quente) / val(fria) : 0;
  const nomes = { n: 'Pedidos', v: 'Faturamento', t: 'Ticket médio' }, nPed = st.reduce((a, s) => a + s.n, 0);
  const li = s => '<li><i class="sw-h" style="background:' + heat(tOf(val(s))) + '"></i><span>Mesa ' + pad(s.numero) + '</span><strong>' + fmtL(val(s)) + '</strong></li>';
  $('#pane').innerHTML = '<div class="kbar">' + perChips() + '<div class="seg" role="group" aria-label="Medida">' + Object.keys(nomes).map(k => '<button data-act="hm" data-m="' + k + '" aria-pressed="' + (met === k) + '">' + nomes[k] + '</button>').join('') + '</div></div>' +
    '<p class="note kh-note">' + perLabel(d) + ' · ' + nPed + ' pedidos feitos nas mesas. Quanto mais quente a cor, mais a mesa vende.</p>' +
    '<div class="mapa"><div class="card"><div class="heat-svg"><svg viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" role="img" aria-label="Mapa de calor das mesas por ' + nomes[met].toLowerCase() + '">' + g + '</svg></div>' +
    '<div class="heat-leg"><span>' + fmtL(mn) + '</span><span class="heat-bar" style="background:linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(heat).join(',') + ')"></span><span>' + fmtL(mx) + '</span></div><p class="note" style="text-align:center">' + nomes[met] + ' por mesa · menos ← → mais</p></div>' +
    '<div class="card rank"><h4>Mesas mais quentes</h4><ol>' + rank.slice(0, 5).map(li).join('') + '</ol><h4>Mesas mais frias</h4><ol>' + rank.slice(-3).reverse().map(li).join('') + '</ol>' +
    (razao > 1.15 ? '<p class="insight">A Mesa ' + pad(quente.numero) + ' rende ' + razao.toFixed(1).replace('.', ',') + '× mais que a Mesa ' + pad(fria.numero) + ' em ' + nomes[met].toLowerCase() + '. Vale olhar posição, conforto e atendimento das mesas frias.</p>' : '') + '</div></div>';
}

/* dicas dos gráficos */
const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip);
function mostrarTip(el){ const r = el.getBoundingClientRect(); tip.textContent = el.dataset.tip; tip.hidden = false; const w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px'; }
document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) mostrarTip(el); else tip.hidden = true; });
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) mostrarTip(el); else tip.hidden = true; });
document.addEventListener('scroll', () => { tip.hidden = true; }, true);
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.aba === 'mapa' && S.rel) desenharMapa(); }); } catch (e) {}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  const confirmaveis = ['cancelar', 'remover-prod', 'novo-codigo', 'remover-user'];
  if (!confirmaveis.includes(a)) S.confirmar = null;
  switch (a){
    case 'sair': sair(); break;
    case 'aba': S.aba = el.dataset.t; S.editId = null; S.formAberto = false; render(); window.scrollTo(0, 0); break;
    case 'kf': S.kf = el.dataset.k; renderPedidos(); break;
    case 'hp': S.hp = el.dataset.p; S.hn = 25; S.premAberta = !!($('#prem') && $('#prem').open); render(); break;
    case 'hc': S.hc = el.dataset.c; S.hn = 25; carregarHist(); break;
    case 'hmore': S.hn += 25; carregarHist(); break;
    case 'hm': S.hm = el.dataset.m; desenharMapa(); break;
    case 'status': mudarStatus(id, el.dataset.s); break;
    case 'despachar': { const sel = $('#ent-' + id); mudarStatus(id, 'rota', { entregador: sel && sel.value }); break; }
    case 'pegar': mudarStatus(id, 'rota'); break;
    case 'pago': try { const d = await chamar('PATCH', '/api/painel/pedidos/' + id + '/pagamento', { pago: true }); upsert(d.pedido); atualizarAbas(); toast('Pagamento confirmado'); } catch (err) { toast(err.message); } break;
    case 'cancelar': if (S.confirmar !== 'c' + id){ S.confirmar = 'c' + id; renderPedidos(); break; } S.confirmar = null; mudarStatus(id, 'cancelado'); break;
    case 'atendido': try { await chamar('PATCH', '/api/painel/chamados/' + id); S.chamados = S.chamados.filter(c => c._id !== id); atualizarAbas(); } catch (err) { toast(err.message); } break;
    case 'novo-prod': S.formAberto = true; S.editId = null; desenharProdutos(); break;
    case 'editar-prod': S.editId = id; S.formAberto = false; desenharProdutos(); window.scrollTo(0, 0); break;
    case 'cancelar-prod': S.editId = null; S.formAberto = false; desenharProdutos(); break;
    case 'esgotar': { const p = S.produtos.find(x => x._id === id); try { const d = await chamar('PATCH', '/api/painel/produtos/' + id, { esgotado: !p.esgotado }); Object.assign(p, d.produto); desenharProdutos(); toast(p.esgotado ? p.nome + ' marcado como esgotado' : p.nome + ' disponível de novo'); } catch (err) { toast(err.message); } break; }
    case 'remover-prod': if (S.confirmar !== 'p' + id){ S.confirmar = 'p' + id; desenharProdutos(); break; } S.confirmar = null; try { await chamar('DELETE', '/api/painel/produtos/' + id); S.produtos = S.produtos.filter(x => x._id !== id); desenharProdutos(); toast('Produto removido'); } catch (err) { toast(err.message); } break;
    case 'copiar': copiar(el.dataset.v); break;
    case 'salvar-mesas': try { await chamar('POST', '/api/painel/mesas', { quantidade: $('#m-qtd').value }); toast('Mesas atualizadas'); renderMesas(); } catch (err) { toast(err.message); } break;
    case 'novo-codigo': { const n = el.dataset.n; if (S.confirmar !== 'm' + n){ S.confirmar = 'm' + n; renderMesas(); break; } S.confirmar = null; try { await chamar('POST', '/api/painel/mesas/' + n + '/novo-codigo'); toast('Novo código gerado. Imprima o QR da Mesa ' + pad(n) + ' de novo.'); renderMesas(); } catch (err) { toast(err.message); } break; }
    case 'exportar': exportarExcel(el); break;
    case 'imprimir': { const p = S.pedidos.find(x => x._id === id); if (p) imprimirPedido(p); break; }
    case 'imp-abrir': S.impAberta = !S.impAberta; renderPedidos(); break;
    case 'imp-fechar': S.impAberta = false; renderPedidos(); break;
    case 'imp-teste': Cupom.imprimir({ numero: 0, tipo: 'delivery', createdAt: new Date(), cliente: { nome: 'Cliente de teste', tel: '(15) 99999-0000' }, entrega: { endereco: 'Rua de Teste, 123', bairro: 'Centro', referencia: 'Perto da praça' },
      linhas: [{ qtd: 2, nome: 'Produto de teste', unit: 10, opcoes: ['sem cebola'] }], obs: 'Cupom de teste da impressora', subtotal: 20, servico: 0, taxaEntrega: 5, total: 25, pagamento: { metodo: 'dinheiro', troco: 50, pago: false } }, S.rest, S.imp.largura); break;
    case 'nova-senha': S.senhaPara = id || null; renderEquipe(); break;
    case 'abrir-senha': $('#f-senha').hidden = false; $('#s-atual').focus(); break;
    case 'fechar-senha': $('#f-senha').hidden = true; $('#f-senha').reset(); break;
    case 'remover-user': if (S.confirmar !== 'u' + id){ S.confirmar = 'u' + id; renderEquipe(); break; } S.confirmar = null; try { await chamar('DELETE', '/api/painel/equipe/' + id); toast('Acesso removido'); renderEquipe(); } catch (err) { toast(err.message); } break;
  }
});
let buscaT;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'h-q'){ S.hq = t.value; S.hn = 25; clearTimeout(buscaT); buscaT = setTimeout(carregarHist, 300); return; }
  if (t.dataset.fin && S.rel){ S.rel.premissas[t.dataset.fin] = Math.max(0, parseFloat(t.value) || 0); renderBal(); salvarPremissas(); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'imp-larg'){ S.imp.largura = +t.value; salvarImp(); return; }
  if (t.id === 'imp-auto'){ S.imp.auto = t.checked; salvarImp(); toast(t.checked ? 'Pedidos novos vão imprimir sozinhos neste computador' : 'Impressão automática desligada'); renderPedidos(); return; }
  if (t.id === 'p-cat'){ $('#p-novacat-w').hidden = t.value !== '__nova'; return; }
  if (t.dataset.preco){ const p = S.produtos.find(x => x._id === t.dataset.preco); try { const d = await chamar('PATCH', '/api/painel/produtos/' + p._id, { preco: t.value }); Object.assign(p, d.produto); toast('Preço de ' + p.nome + ': ' + brl(p.preco)); } catch (err) { toast(err.message); t.value = p.preco; } }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'f-prod') return salvarProduto(e);
  if (e.target.id === 'f-config') return salvarConfig(e);
  if (e.target.classList.contains('eq-senha')){
    e.preventDefault(); const uid = e.target.dataset.uid, u = S.equipe.find(x => String(x.id) === uid);
    try { await chamar('POST', '/api/painel/equipe/' + uid + '/senha', { senha: $('#ns-' + uid).value }); S.senhaPara = null; toast('Senha de ' + (u ? u.nome : 'a pessoa') + ' trocada. Passe a nova senha para ela.'); renderEquipe(); }
    catch (err) { toast(err.message); } return;
  }
  if (e.target.id === 'f-senha'){
    e.preventDefault();
    try { await chamar('POST', '/api/auth/senha', { atual: $('#s-atual').value, nova: $('#s-nova').value }); e.target.reset(); e.target.hidden = true; toast('Senha trocada'); }
    catch (err) { toast(err.message); } return;
  }
  if (e.target.id === 'f-user'){
    e.preventDefault();
    try { await chamar('POST', '/api/painel/equipe', { nome: $('#u-nome').value, email: $('#u-email').value, senha: $('#u-senha').value, papel: $('#u-papel').value }); toast('Pessoa adicionada. Passe o e-mail e a senha para ela.'); if ($('#u-papel').value === 'entregador') chamar('GET', '/api/painel/entregadores').then(d => { S.entregadores = d.entregadores; }); renderEquipe(); }
    catch (err) { toast(err.message); }
  }
});

iniciar();
})();
