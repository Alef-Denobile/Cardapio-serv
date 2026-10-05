/* Área de devs: todos os restaurantes da plataforma */
(function(){
'use strict';
const { $, $$, esc, brl, pad, hora, initials, toast, aplicarCor, foto, api, guardar, copiar, pagTxt, ajudaSenha } = C;
ajudaSenha('Quem tem acesso ao servidor define uma senha nova com: npm run novo-admin -- --email seu@email --senha "nova senha" --trocar-senha');
const SELOS = ['vegetariano', 'vegano', 'sem glúten'];
const PAPEL = { dono: 'Dono', cozinha: 'Cozinha', entregador: 'Entregador' };
const DESC = {
  mesa: 'O cliente pede pelo QR Code da mesa. Desligado, a aba de mesas some do painel do dono.',
  chamados: 'Botões "Chamar garçom" e "Pedir a conta" no celular do cliente.',
  retirada: 'O cliente pede pelo link e retira no balcão.',
  delivery: 'Pedidos com entrega em casa. Desligado, o dono não consegue religar.',
  pix: 'Mostra a chave Pix para o cliente pagar.',
  cartao: 'Maquininha levada pelo entregador.',
  dinheiro: 'Pagamento em dinheiro na entrega, com troco.',
  online: 'Na entrega, o cliente pode pagar com cartão ou Pix pelo próprio site (exige conta de cliente). O pedido só chega à cozinha depois de pago.',
  whatsapp: 'O cliente recebe no WhatsApp: pedido recebido, pronto para retirar, saiu para entrega e cancelado. Cada mensagem tem custo para a plataforma (API oficial). O botão manual "WhatsApp do cliente" no painel funciona sempre, sem custo.',
  vitrine: 'O restaurante aparece na vitrine do ChefOnline, junto com os outros. O link próprio e os QR Codes continuam funcionando.'
};

const S = { token: guardar.ler('admin:token', ''), eu: null, recursos: {}, aba: 'rest', lista: [], q: '', sel: null, sub: 'funcoes', det: null, produtos: [], cats: [], editId: null, formAberto: false, confirmar: null, novo: false };
const chamar = (m, u, b) => api(m, u, b, S.token).catch(e => { if (e.status === 401) sair(e.message); throw e; });
const quando = t => { const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + hora(t); };

/* ---------- login ---------- */
async function iniciar(){
  if (!S.token) return mostrarLogin();
  try { const d = await chamar('GET', '/api/admin/eu'); S.eu = d.admin; S.recursos = d.recursos; entrar(); } catch (e) { if (e.status !== 401) mostrarLogin(e.message); }
}
function mostrarLogin(msg){ $('#v-login').hidden = false; $('#v-app').hidden = true; if (msg){ $('#l-erro').hidden = false; $('#l-erro').textContent = msg; } setTimeout(() => $('#l-email').focus(), 50); }
$('#f-login').addEventListener('submit', async e => {
  e.preventDefault(); const b = $('#l-btn'); $('#l-erro').hidden = true; b.disabled = true; b.textContent = 'Entrando…';
  try { const d = await api('POST', '/api/admin/login', { email: $('#l-email').value, senha: $('#l-senha').value }); S.token = d.token; guardar.gravar('admin:token', d.token); $('#l-senha').value = ''; const eu = await chamar('GET', '/api/admin/eu'); S.eu = eu.admin; S.recursos = eu.recursos; entrar(); }
  catch (err) { $('#l-erro').hidden = false; $('#l-erro').textContent = err.message; }
  b.disabled = false; b.textContent = 'Entrar';
});
function sair(msg){ guardar.apagar('admin:token'); S.token = ''; mostrarLogin(msg); }
function entrar(){ $('#v-login').hidden = true; $('#v-app').hidden = false; aplicarCor('#3A3F8F'); render(); }

/* ---------- estrutura ---------- */
function render(){
  $('#head').innerHTML = '<div class="who"><div class="logo mono" aria-hidden="true">&lt;/&gt;</div><div><span class="dev-flag">Área de devs</span><h1>Plataforma</h1><small>' + esc(S.eu.nome) + ' · ' + esc(S.eu.email) + '</small></div></div><button class="btn sm ghost" data-act="sair">Sair</button>';
  $('#tabs').innerHTML = [['rest', 'Restaurantes'], ['log', 'Histórico de alterações'], ['devs', 'Equipe de devs']].map(t => '<button role="tab" data-act="aba" data-t="' + t[0] + '" aria-selected="' + (S.aba === t[0]) + '">' + t[1] + '</button>').join('');
  if (S.aba === 'rest') return S.sel ? renderDetalhe() : renderLista();
  if (S.aba === 'log') return renderLogGeral();
  if (S.aba === 'devs') return renderDevs();
}

/* ---------- lista de restaurantes ---------- */
async function renderLista(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { S.lista = (await chamar('GET', '/api/admin/restaurantes')).restaurantes; } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  desenharLista();
}
function desenharLista(){
  const l = S.lista, at = l.filter(x => x.ativo).length;
  const kpi = '<div class="kpis"><div class="kpi"><span>Restaurantes</span><strong>' + l.length + '</strong></div><div class="kpi"><span>Ativos</span><strong>' + at + '</strong></div><div class="kpi"><span>Suspensos</span><strong>' + (l.length - at) + '</strong></div><div class="kpi"><span>Pedidos hoje (todos)</span><strong>' + l.reduce((a, x) => a + x.pedidosHoje, 0) + '</strong></div></div>';
  const form = S.novo ? '<h3>Novo restaurante</h3><form id="f-novo" class="card" novalidate><div class="grid2"><div><label for="n-nome">Nome do restaurante</label><input id="n-nome" placeholder="Pizzaria do Zé"></div><div><label for="n-slug">Endereço (slug)</label><input id="n-slug" placeholder="pizzaria-do-ze"></div>' +
    '<div><label for="n-dono">Nome do dono</label><input id="n-dono" placeholder="José"></div><div><label for="n-email">E-mail do dono</label><input id="n-email" type="email" autocomplete="off"></div><div><label for="n-senha">Senha inicial do dono (mín. 8)</label><input id="n-senha" type="text" autocomplete="new-password"></div>' +
    '<div><label for="n-mesas">Mesas</label><input id="n-mesas" type="number" min="0" max="200" value="10"></div><div><label for="n-plano">Plano</label><input id="n-plano" value="Básico"></div></div>' +
    '<p class="note">O dono entra em /painel com esse e-mail e senha. Peça para ele trocar a senha no primeiro acesso.</p><div class="row"><button class="btn" type="submit">Criar restaurante</button><button class="btn ghost" type="button" data-act="cancelar-novo">Cancelar</button></div></form>' : '';
  const q = C.norm(S.q);
  const vis = l.filter(x => !q || C.norm(x.nome + ' ' + x.slug + ' ' + x.plano).includes(q));
  $('#pane').innerHTML = kpi + form + '<div class="kbar" style="margin-top:16px"><input id="r-q" type="search" placeholder="Buscar restaurante, endereço ou plano" value="' + esc(S.q) + '" style="max-width:340px" aria-label="Buscar restaurante">' + (S.novo ? '' : '<button class="btn sm" data-act="novo">+ Novo restaurante</button>') + '</div>' +
    '<div class="rlist">' + (vis.map(x => '<div class="rcard"><div class="logo mono" style="background:' + esc(x.cor) + '">' + esc(initials(x.nome)) + '</div><div><h3>' + esc(x.nome) + '<span class="st ' + (x.ativo ? 'on' : 'off') + '">' + (x.ativo ? 'Ativo' : 'Suspenso') + '</span></h3>' +
      '<div class="meta"><span>/r/' + esc(x.slug) + '</span><span>Plano ' + esc(x.plano || 'não definido') + '</span><span>' + x.produtos + ' produtos</span><span>' + x.equipe + ' acessos</span><span>' + x.pedidosHoje + ' pedidos hoje</span><span>' + brl(x.faturamento30) + ' em 30 dias</span><span>' + (x.ultimoPedido ? 'último pedido ' + quando(x.ultimoPedido) : 'sem pedidos em 30 dias') + '</span></div>' +
      '<div class="feat-chips">' + Object.keys(S.recursos).map(k => '<span class="fc' + (x.recursos[k] ? '' : ' off') + '">' + esc(S.recursos[k].replace(/ \(.*\)/, '')) + '</span>').join('') + '</div></div>' +
      '<button class="btn sm" data-act="abrir" data-id="' + x.id + '">Gerenciar</button></div>').join('') || '<p class="note">Nenhum restaurante encontrado.</p>') + '</div>';
}

/* ---------- detalhe ---------- */
const SUBS = [['funcoes', 'Funções e situação'], ['catalogo', 'Catálogo'], ['dados', 'Dados e regras'], ['equipe', 'Acessos'], ['pedidos', 'Pedidos recentes'], ['historico', 'Histórico']];
async function carregarDetalhe(){ const d = await chamar('GET', '/api/admin/restaurantes/' + S.sel); S.det = d; }
async function renderDetalhe(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { await carregarDetalhe(); } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  desenharDetalhe();
}
function desenharDetalhe(){
  const r = S.det.restaurante;
  $('#pane').innerHTML = '<button class="crumb" data-act="voltar">‹ Todos os restaurantes</button>' +
    '<div class="kh" style="padding-top:8px"><div><div class="table-tag">Plano ' + esc(r.plano || 'não definido') + '</div><h2>' + esc(r.nome) + '<span class="st ' + (r.ativo ? 'on' : 'off') + '">' + (r.ativo ? 'Ativo' : 'Suspenso') + '</span></h2></div>' +
    '<div class="row" style="margin:0"><a class="btn sm ghost" href="/r/' + esc(r.slug) + '" target="_blank" rel="noopener">Abrir cardápio</a><button class="btn sm ghost" data-act="copiar" data-v="' + esc(location.origin + '/r/' + r.slug) + '">Copiar link</button></div></div>' +
    '<div class="tabs" role="tablist" style="margin-top:6px">' + SUBS.map(t => '<button role="tab" data-act="sub" data-t="' + t[0] + '" aria-selected="' + (S.sub === t[0]) + '">' + t[1] + '</button>').join('') + '</div><div id="sub" class="pane"></div>';
  ({ funcoes: subFuncoes, catalogo: subCatalogo, dados: subDados, equipe: subEquipe, pedidos: subPedidos, historico: subHistorico })[S.sub]();
}

function subFuncoes(){
  const r = S.det.restaurante;
  $('#sub').innerHTML = '<div class="bals"><div><h3 style="margin-top:4px">Funções liberadas</h3><form id="f-rec" class="card"><div class="toggles">' + Object.keys(S.recursos).map(k => '<label class="tg" for="rc-' + k + '"><span>' + esc(S.recursos[k]) + '<small>' + esc(DESC[k] || '') + '</small></span><input type="checkbox" class="switch" id="rc-' + k + '" data-rc="' + k + '"' + (r.recursos[k] ? ' checked' : '') + '></label>').join('') + '</div>' +
    '<p class="note">Funções desligadas aqui somem para o cliente e o dono não consegue religar pelo painel. Pedidos que já estão em andamento continuam normalmente.</p><div class="row"><button class="btn" type="submit">Salvar funções</button></div></form></div>' +
    '<div><h3 style="margin-top:4px">Situação</h3><form id="f-sit" class="card"><label class="tg" for="s-ativo"><span>Restaurante ativo<small>Suspenso, o cardápio mostra "temporariamente indisponível" e ninguém da equipe do restaurante consegue entrar no painel.</small></span><input type="checkbox" class="switch" id="s-ativo"' + (r.ativo ? ' checked' : '') + '></label>' +
    '<label for="s-motivo">Motivo da suspensão (interno)</label><input id="s-motivo" value="' + esc(r.motivoSuspensao) + '" placeholder="Ex.: mensalidade em atraso">' +
    '<label for="s-plano">Plano</label><input id="s-plano" value="' + esc(r.plano) + '">' +
    '<label for="s-obs">Observações internas (só a equipe de devs vê)</label><textarea id="s-obs" rows="4" placeholder="Contato, combinados, pendências">' + esc(r.observacoes) + '</textarea>' +
    '<div class="row"><button class="btn" type="submit">Salvar situação</button></div></form></div></div>';
}

/* catálogo */
async function subCatalogo(){
  $('#sub').innerHTML = '<p class="note">Carregando…</p>';
  try { const d = await chamar('GET', '/api/admin/restaurantes/' + S.sel + '/produtos'); S.produtos = d.produtos; S.cats = d.categorias || []; } catch (e) { $('#sub').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  desenharCatalogo();
}
function categorias(){ return S.cats.concat([...new Set(S.produtos.map(p => p.categoria))].filter(x => !S.cats.includes(x))); }
function escolhas(str, sep){ return String(str || '').split(sep).map(s => s.trim()).filter(Boolean).map(s => { const a = s.split('|'); return { nome: a[0].trim(), preco: Math.max(0, parseFloat(String(a[1] || '0').replace(',', '.')) || 0) }; }).filter(e => e.nome); }
function desenharCatalogo(){
  const p = S.editId ? S.produtos.find(x => x._id === S.editId) : null, cats = categorias();
  let form = '';
  if (S.formAberto || p){
    const um = p ? p.opcoes.find(o => o.tipo === 'um') : null, va = p ? p.opcoes.find(o => o.tipo === 'varios') : null, ch = e => e.nome + (e.preco ? ' | ' + e.preco : '');
    form = '<h3>' + (p ? 'Editar produto' : 'Novo produto') + '</h3><form id="f-prod" class="card" novalidate>' +
      '<div class="grid2"><div><label for="p-nome">Nome</label><input id="p-nome" value="' + esc(p ? p.nome : '') + '"></div><div><label for="p-preco">Preço (R$)</label><input id="p-preco" type="number" step="0.01" min="0" value="' + (p ? p.preco : '') + '"></div></div>' +
      '<label for="p-desc">Descrição</label><input id="p-desc" value="' + esc(p ? p.descricao : '') + '">' +
      '<div class="grid2"><div><label for="p-cat">Categoria</label><select id="p-cat">' + cats.map(c => '<option' + (p && p.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '<option value="__nova">+ Nova categoria…</option></select></div><div id="p-novacat-w"' + (cats.length ? ' hidden' : '') + '><label for="p-novacat">Nova categoria</label><input id="p-novacat"></div></div>' +
      '<label for="p-foto">Endereço da foto</label><input id="p-foto" value="' + esc(p ? p.fotoUrl : '') + '" placeholder="https://…">' +
      '<label>Selos</label><div class="checks">' + SELOS.map((s, i) => '<label for="p-s' + i + '"><input type="checkbox" id="p-s' + i + '" data-selo="' + s + '"' + (p && p.selos.includes(s) ? ' checked' : '') + '> ' + s + '</label>').join('') + '<label for="p-dest"><input type="checkbox" id="p-dest"' + (p && p.destaque ? ' checked' : '') + '> Destaque</label><label for="p-esg"><input type="checkbox" id="p-esg"' + (p && p.esgotado ? ' checked' : '') + '> Esgotado</label></div>' +
      '<div class="grid2"><div><label for="p-o1t">Escolha obrigatória (título)</label><input id="p-o1t" value="' + esc(um ? um.nome : '') + '"></div><div><label for="p-o1c">Opções, separadas por vírgula</label><input id="p-o1c" value="' + esc(um ? um.escolhas.map(ch).join(', ') : '') + '"></div></div>' +
      '<label for="p-add">Adicionais pagos (um por linha: Nome | preço)</label><textarea id="p-add" rows="3">' + esc(va ? va.escolhas.map(ch).join('\n') : '') + '</textarea>' +
      '<div class="row"><button class="btn" type="submit">' + (p ? 'Salvar alterações' : 'Adicionar ao catálogo') + '</button><button class="btn ghost" type="button" data-act="cancelar-prod">Cancelar</button></div></form><h3>Catálogo</h3>';
  }
  const lista = cats.map((c, ci) => { const l = S.produtos.filter(x => x.categoria === c); if (!l.length) return '';
    return '<p class="table-tag" style="margin:16px 0 0">' + esc(c) + '</p>' + l.map(x => '<div class="adm-item"><div class="ph">' + foto(x, ci) + '</div><div><strong>' + esc(x.nome) + '</strong><div class="pr-row"><label class="pr-l" for="pr' + x._id + '">R$</label><input class="pr-in" id="pr' + x._id + '" type="number" step="0.01" min="0" data-preco="' + x._id + '" value="' + x.preco + '" aria-label="Preço de ' + esc(x.nome) + '"></div><small>' + (x.esgotado ? 'Esgotado' : 'Disponível') + (x.destaque ? ' · Destaque' : '') + (x.opcoes.length ? ' · com opções' : '') + '</small></div>' +
      '<div class="row"><button class="btn sm ghost" data-act="editar-prod" data-id="' + x._id + '">Editar</button><button class="btn sm ghost" data-act="esgotar" data-id="' + x._id + '">' + (x.esgotado ? 'Disponível' : 'Esgotar') + '</button><button class="btn sm ' + (S.confirmar === 'p' + x._id ? 'danger' : 'ghost') + '" data-act="remover-prod" data-id="' + x._id + '">' + (S.confirmar === 'p' + x._id ? 'Confirmar remoção' : 'Remover') + '</button></div></div>').join(''); }).join('');
  $('#sub').innerHTML = '<div class="row between" style="margin-top:0"><span class="note" style="margin:0">' + S.produtos.length + ' produtos · alterações ficam registradas no histórico</span>' + (S.formAberto || p ? '' : '<button class="btn sm" data-act="novo-prod">+ Novo produto</button>') + '</div>' + form + (lista || '<p class="note">Nenhum produto cadastrado.</p>');
}
async function salvarProduto(e){
  e.preventDefault();
  let cat = $('#p-cat').value; if (cat === '__nova' || !cat) cat = $('#p-novacat').value.trim();
  const opcoes = []; const t1 = $('#p-o1t').value.trim(), c1 = escolhas($('#p-o1c').value, ',');
  if (t1 && c1.length) opcoes.push({ nome: t1, tipo: 'um', escolhas: c1 });
  const ad = escolhas($('#p-add').value, /\n/); if (ad.length) opcoes.push({ nome: 'Adicionais', tipo: 'varios', escolhas: ad });
  const corpo = { nome: $('#p-nome').value, preco: $('#p-preco').value, descricao: $('#p-desc').value, categoria: cat, fotoUrl: $('#p-foto').value, selos: $$('#f-prod [data-selo]').filter(x => x.checked).map(x => x.dataset.selo), destaque: $('#p-dest').checked, esgotado: $('#p-esg').checked, opcoes };
  try { const base = '/api/admin/restaurantes/' + S.sel + '/produtos'; if (S.editId) await chamar('PUT', base + '/' + S.editId, corpo); else await chamar('POST', base, corpo); toast(S.editId ? 'Produto atualizado' : 'Produto adicionado'); S.editId = null; S.formAberto = false; subCatalogo(); }
  catch (err) { toast(err.message); }
}

/* dados e regras */
function subDados(){
  const c = S.det.restaurante, d = c.delivery;
  const inp = (id, lab, v, extra) => '<div><label for="' + id + '">' + lab + '</label><input id="' + id + '" value="' + esc(v) + '"' + (extra || '') + '></div>';
  $('#sub').innerHTML = '<form id="f-config" novalidate><div class="card"><div class="grid2">' + inp('c-nome', 'Nome', c.nome) + inp('c-frase', 'Frase curta', c.frase) + '<div><label for="c-cor">Cor</label><input id="c-cor" type="color" value="' + esc(c.cor) + '"></div>' + inp('c-logo', 'Endereço do logo', c.logoUrl) +
    inp('c-abre', 'Abre às', c.abre, ' type="time"') + inp('c-fecha', 'Fecha às', c.fecha, ' type="time"') + inp('c-serv', 'Taxa de serviço (%)', c.taxaServico, ' type="number" min="0" max="30"') + inp('c-whats', 'WhatsApp', c.whatsapp) + inp('c-pix', 'Chave Pix', c.chavePix) + '</div>' +
    '<div class="checks"><label for="c-fora"><input type="checkbox" id="c-fora"' + (c.aceitarForaDoHorario ? ' checked' : '') + '> Aceitar pedidos fora do horário</label><label for="c-dat"><input type="checkbox" id="c-dat"' + (d.ativo ? ' checked' : '') + '> Delivery ligado pelo dono</label></div>' +
    '<label for="c-cats">Ordem das categorias (uma por linha)</label><textarea id="c-cats" rows="4">' + esc((c.categorias || []).join('\n')) + '</textarea>' +
    '<div class="grid2">' + inp('c-tempo', 'Tempo de entrega', d.tempo) + inp('c-tret', 'Tempo para retirada', d.tempoRetirada) + inp('c-min', 'Pedido mínimo (R$)', d.pedidoMinimo, ' type="number" min="0"') + inp('c-gratis', 'Entrega grátis acima de (R$)', d.gratisAcimaDe, ' type="number" min="0"') + '</div>' +
    '<label for="c-bairros">Bairros e taxa (Bairro | taxa)</label><textarea id="c-bairros" rows="5">' + esc(d.bairros.map(b => b.nome + ' | ' + b.taxa).join('\n')) + '</textarea>' +
    '<p class="note">"Delivery ligado pelo dono" é o botão que o restaurante controla. Para bloquear o delivery de vez, desligue a função em Funções e situação.</p><div class="row"><button class="btn" type="submit">Salvar dados</button></div></div></form>';
}

/* acessos */
function subEquipe(){
  const eq = S.det.equipe;
  $('#sub').innerHTML = '<div class="card">' + eq.map(u => '<div class="eq"><div><strong>' + esc(u.nome) + '</strong> <span class="badge b-neu">' + PAPEL[u.papel] + '</span>' + (u.ativo ? '' : ' <span class="badge b-warn">Desativado</span>') + '<br><small>' + esc(u.email) + '</small>' +
    (S.confirmar === 's' + u.id ? '<div class="row" style="margin-top:6px"><input id="nova-senha" type="text" placeholder="Nova senha (mín. 8)" autocomplete="new-password" style="max-width:220px"><button class="btn sm" data-act="salvar-senha" data-id="' + u.id + '">Salvar senha</button><button class="mini" data-act="nada">Cancelar</button></div>' : '') + '</div>' +
    '<div class="row" style="margin:0"><button class="btn sm ghost" data-act="pedir-senha" data-id="' + u.id + '">Redefinir senha</button><button class="btn sm ghost" data-act="ativo-user" data-id="' + u.id + '" data-v="' + (u.ativo ? '0' : '1') + '">' + (u.ativo ? 'Desativar' : 'Reativar') + '</button></div></div>').join('') + '</div>' +
    '<h3>Adicionar acesso</h3><form id="f-user" class="card" novalidate><div class="grid2"><div><label for="u-nome">Nome</label><input id="u-nome"></div><div><label for="u-papel">Função</label><select id="u-papel"><option value="dono">Dono</option><option value="cozinha">Cozinha</option><option value="entregador">Entregador</option></select></div><div><label for="u-email">E-mail</label><input id="u-email" type="email" autocomplete="off"></div><div><label for="u-senha">Senha (mín. 8)</label><input id="u-senha" type="text" autocomplete="new-password"></div></div><div class="row"><button class="btn" type="submit">Adicionar</button></div></form>';
}

/* pedidos */
async function subPedidos(){
  $('#sub').innerHTML = '<p class="note">Carregando…</p>';
  try {
    const l = (await chamar('GET', '/api/admin/restaurantes/' + S.sel + '/pedidos?limite=50')).pedidos;
    $('#sub').innerHTML = '<p class="note" style="margin-top:0">Só consulta. Para mudar o andamento de um pedido, use o painel do restaurante.</p><div class="card tbl" style="padding:0"><table><thead><tr><th>Pedido</th><th>Data</th><th>Onde</th><th>Cliente</th><th style="text-align:right">Total</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>' +
      (l.map(p => '<tr><td>#' + p.numero + '</td><td>' + quando(p.createdAt) + '</td><td>' + (p.tipo === 'mesa' ? 'Mesa ' + pad(p.mesa) : p.tipo === 'delivery' ? 'Entrega · ' + esc(p.entrega && p.entrega.bairro) : 'Retirada') + '</td><td>' + esc(p.cliente && p.cliente.nome) + '</td><td style="text-align:right">' + brl(p.total) + '</td><td>' + esc(pagTxt(p)) + (p.pagamento.pago ? ' · pago' : '') + '</td><td>' + C.STATUS[p.status] + '</td></tr>').join('') || '<tr><td colspan="7" class="note">Nenhum pedido ainda.</td></tr>') + '</tbody></table></div>';
  } catch (e) { $('#sub').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

/* histórico */
const logItem = a => '<div class="log-i"><time>' + quando(a.createdAt) + '</time><div><strong>' + esc(a.acao) + (a.restauranteNome && S.aba === 'log' ? ' · ' + esc(a.restauranteNome) : '') + '</strong><span>' + esc(a.detalhe) + '</span><br><small class="note">por ' + esc(a.adminNome) + '</small></div></div>';
async function subHistorico(){
  $('#sub').innerHTML = '<p class="note">Carregando…</p>';
  try { const l = (await chamar('GET', '/api/admin/restaurantes/' + S.sel + '/historico')).historico; $('#sub').innerHTML = '<div class="card log">' + (l.map(logItem).join('') || '<p class="note">Nenhuma alteração feita pela equipe de devs.</p>') + '</div>'; }
  catch (e) { $('#sub').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}
async function renderLogGeral(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try { const l = (await chamar('GET', '/api/admin/historico')).historico; $('#pane').innerHTML = '<p class="note" style="margin-top:0">As 100 alterações mais recentes feitas pela equipe de devs, em todos os restaurantes.</p><div class="card log">' + (l.map(logItem).join('') || '<p class="note">Nada registrado ainda.</p>') + '</div>'; }
  catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

/* devs */
async function renderDevs(){
  $('#pane').innerHTML = '<p class="note">Carregando…</p>';
  try {
    const l = (await chamar('GET', '/api/admin/devs')).devs;
    $('#pane').innerHTML = '<div class="card">' + l.map(a => '<div class="eq"><div><strong>' + esc(a.nome) + '</strong>' + (a.ativo ? '' : ' <span class="badge b-warn">Desativado</span>') + '<br><small>' + esc(a.email) + '</small></div>' + (String(a.id) === String(S.eu.id) ? '<small>Você</small>' : '<button class="btn sm ghost" data-act="ativo-dev" data-id="' + a.id + '" data-v="' + (a.ativo ? '0' : '1') + '">' + (a.ativo ? 'Desativar' : 'Reativar') + '</button>') + '</div>').join('') + '</div>' +
      '<h3>Adicionar dev</h3><form id="f-dev" class="card" novalidate><div class="grid2"><div><label for="d-nome">Nome</label><input id="d-nome"></div><div><label for="d-email">E-mail</label><input id="d-email" type="email" autocomplete="off"></div><div><label for="d-senha">Senha (mín. 10)</label><input id="d-senha" type="text" autocomplete="new-password"></div></div><p class="note">Contas de dev veem e alteram todos os restaurantes. Dê acesso só a quem mantém a plataforma.</p><div class="row"><button class="btn" type="submit">Adicionar dev</button></div></form>';
  } catch (e) { $('#pane').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (!['remover-prod', 'pedir-senha', 'salvar-senha'].includes(a)) S.confirmar = null;
  const base = () => '/api/admin/restaurantes/' + S.sel;
  switch (a){
    case 'sair': sair(); break;
    case 'aba': S.aba = el.dataset.t; S.sel = null; render(); break;
    case 'novo': S.novo = true; desenharLista(); setTimeout(() => $('#n-nome').focus(), 30); break;
    case 'cancelar-novo': S.novo = false; desenharLista(); break;
    case 'abrir': S.sel = id; S.sub = 'funcoes'; S.editId = null; S.formAberto = false; renderDetalhe(); window.scrollTo(0, 0); break;
    case 'voltar': S.sel = null; renderLista(); break;
    case 'sub': S.sub = el.dataset.t; S.editId = null; S.formAberto = false; desenharDetalhe(); break;
    case 'copiar': copiar(el.dataset.v); break;
    case 'novo-prod': S.formAberto = true; S.editId = null; desenharCatalogo(); break;
    case 'editar-prod': S.editId = id; S.formAberto = false; desenharCatalogo(); window.scrollTo(0, 0); break;
    case 'cancelar-prod': S.editId = null; S.formAberto = false; desenharCatalogo(); break;
    case 'esgotar': { const p = S.produtos.find(x => x._id === id); try { const d = await chamar('PATCH', base() + '/produtos/' + id, { esgotado: !p.esgotado }); Object.assign(p, d.produto); desenharCatalogo(); toast(p.nome + (p.esgotado ? ' marcado como esgotado' : ' disponível de novo')); } catch (err) { toast(err.message); } break; }
    case 'remover-prod': if (S.confirmar !== 'p' + id){ S.confirmar = 'p' + id; desenharCatalogo(); break; } S.confirmar = null; try { await chamar('DELETE', base() + '/produtos/' + id); S.produtos = S.produtos.filter(x => x._id !== id); desenharCatalogo(); toast('Produto removido'); } catch (err) { toast(err.message); } break;
    case 'pedir-senha': S.confirmar = 's' + id; subEquipe(); setTimeout(() => { const i = $('#nova-senha'); if (i) i.focus(); }, 30); break;
    case 'nada': subEquipe(); break;
    case 'salvar-senha': try { await chamar('POST', base() + '/equipe/' + id + '/senha', { senha: $('#nova-senha').value }); S.confirmar = null; toast('Senha redefinida. Passe a nova senha para a pessoa.'); subEquipe(); } catch (err) { toast(err.message); } break;
    case 'ativo-user': try { await chamar('PATCH', base() + '/equipe/' + id, { ativo: el.dataset.v === '1' }); await carregarDetalhe(); subEquipe(); toast(el.dataset.v === '1' ? 'Acesso reativado' : 'Acesso desativado'); } catch (err) { toast(err.message); } break;
    case 'ativo-dev': try { await chamar('PATCH', '/api/admin/devs/' + id, { ativo: el.dataset.v === '1' }); renderDevs(); } catch (err) { toast(err.message); } break;
  }
});
document.addEventListener('input', e => { if (e.target.id === 'r-q'){ S.q = e.target.value; const pos = e.target.selectionStart; desenharLista(); const i = $('#r-q'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {} } });
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'p-cat'){ $('#p-novacat-w').hidden = t.value !== '__nova'; return; }
  if (t.dataset.preco){ const p = S.produtos.find(x => x._id === t.dataset.preco); try { const d = await chamar('PATCH', '/api/admin/restaurantes/' + S.sel + '/produtos/' + p._id, { preco: t.value }); Object.assign(p, d.produto); toast('Preço de ' + p.nome + ': ' + brl(p.preco)); } catch (err) { toast(err.message); t.value = p.preco; } }
});
document.addEventListener('submit', async e => {
  const id = e.target.id, base = '/api/admin/restaurantes/' + S.sel; e.preventDefault();
  const v = x => $('#' + x).value;
  try {
    if (id === 'f-prod') return salvarProduto(e);
    if (id === 'f-novo'){ const d = await chamar('POST', '/api/admin/restaurantes', { nome: v('n-nome'), slug: v('n-slug'), donoNome: v('n-dono'), email: v('n-email'), senha: v('n-senha'), mesas: v('n-mesas'), plano: v('n-plano') }); S.novo = false; toast('Restaurante criado'); S.sel = d.restaurante.id; S.sub = 'funcoes'; renderDetalhe(); }
    if (id === 'f-rec'){ const corpo = {}; $$('[data-rc]').forEach(x => { corpo[x.dataset.rc] = x.checked; }); await chamar('PUT', base + '/recursos', corpo); await carregarDetalhe(); toast('Funções salvas'); desenharDetalhe(); }
    if (id === 'f-sit'){ await chamar('PATCH', base + '/situacao', { ativo: $('#s-ativo').checked, motivo: v('s-motivo'), plano: v('s-plano'), observacoes: v('s-obs') }); await carregarDetalhe(); toast('Situação salva'); desenharDetalhe(); }
    if (id === 'f-config'){ await chamar('PUT', base + '/config', { nome: v('c-nome'), frase: v('c-frase'), cor: v('c-cor'), logoUrl: v('c-logo'), abre: v('c-abre'), fecha: v('c-fecha'), taxaServico: v('c-serv'), whatsapp: v('c-whats'), chavePix: v('c-pix'), aceitarForaDoHorario: $('#c-fora').checked, categorias: v('c-cats').split('\n').map(s => s.trim()).filter(Boolean),
      delivery: { ativo: $('#c-dat').checked, tempo: v('c-tempo'), tempoRetirada: v('c-tret'), pedidoMinimo: v('c-min'), gratisAcimaDe: v('c-gratis'), bairros: escolhas(v('c-bairros'), /\n/).map(x => ({ nome: x.nome, taxa: x.preco })) } }); await carregarDetalhe(); toast('Dados salvos'); desenharDetalhe(); }
    if (id === 'f-user'){ await chamar('POST', base + '/equipe', { nome: v('u-nome'), email: v('u-email'), senha: v('u-senha'), papel: v('u-papel') }); await carregarDetalhe(); toast('Acesso criado'); subEquipe(); }
    if (id === 'f-dev'){ await chamar('POST', '/api/admin/devs', { nome: v('d-nome'), email: v('d-email'), senha: v('d-senha') }); toast('Dev adicionado'); renderDevs(); }
  } catch (err) { toast(err.message); }
});

iniciar();
})();
