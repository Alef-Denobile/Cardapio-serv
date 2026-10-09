/* Área de devs: todos os restaurantes da plataforma */
(function(){
'use strict';
const N = n => String(n == null ? '' : n).padStart(3, '0'); // número do pedido do dia: 001, 002…
const { $, $$, esc, brl, pad, hora, initials, toast, aplicarCor, foto, api, guardar, copiar, pagTxt, ajudaSenha } = C;
ajudaSenha('Quem tem acesso ao servidor define uma senha nova com: npm run novo-admin -- --email seu@email --senha "nova senha" --trocar-senha');
const SELOS = ['vegetariano', 'vegano', 'sem glúten'];
const PAPEL = { dono: 'Dono', cozinha: 'Cozinha', entregador: 'Entregador' };
const DESC = {
  totem: 'Tela de autoatendimento para tablet ou totem no balcão. O dono vê o link no painel (Mesas, QR e totem); trocar o código é só aqui.',
  nfce: 'Emissão de NFC-e pelo painel. Precisa de emissor configurado no servidor (FISCAL_PROVEDOR) e dos dados fiscais do restaurante.',
  mesa: 'O cliente pede pelo QR Code da mesa. Desligado, a aba de mesas some do painel do dono e os QR param de aceitar pedidos.',
  chamados: 'Botões "Chamar garçom" e "Pedir a conta" no celular do cliente.',
  retirada: 'O cliente pede pelo link e retira no balcão.',
  delivery: 'Pedidos com entrega em casa. Desligado, o dono não consegue religar.',
  pix: 'Mostra a chave Pix para o cliente pagar.',
  cartao: 'Maquininha levada pelo entregador.',
  dinheiro: 'Pagamento em dinheiro na entrega, com troco.',
  online: 'Na entrega, o cliente pode pagar com cartão ou Pix pelo próprio site (exige conta de cliente). O pedido só chega à cozinha depois de pago.',
  pixauto: 'O dono liga a conta do Mercado Pago dele em Configurações e o pedido pago por Pix entra sozinho, sem conferir comprovante.',
  combos: 'Extra. Produtos do tipo combo (escolha 1 lanche + 1 bebida...) e pizza meio a meio, com preço pelo maior sabor ou pela média.',
  horarios: 'Extra. Cada produto pode ter dias e horário (café da manhã até 11h, executivo de segunda a sexta). Fora do horário aparece indisponível.',
  carrinho: 'Extra. Quem montou o pedido no site, deu o WhatsApp, aceitou o lembrete e não finalizou recebe uma mensagem depois de um tempo. Cada mensagem tem custo (API oficial).',
  dominio: 'Extra do plano mais caro. O restaurante usa um endereço próprio (pizzariadoze.com.br) em vez de /r/nome.',
  whatsapp: 'O cliente recebe no WhatsApp: pedido recebido, pronto para retirar, saiu para entrega e cancelado. Cada mensagem tem custo para a plataforma (API oficial). O botão manual "WhatsApp do cliente" no painel funciona sempre, sem custo.',

};

const S = { mesas: [], totem: '', totemImp: false, token: guardar.ler('admin:token', ''), eu: null, recursos: {}, aba: 'rest', lista: [], q: '', sel: null, sub: 'funcoes', det: null, produtos: [], cats: [], editId: null, formAberto: false, confirmar: null, novo: false };
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
function entrar(){ $('#v-login').hidden = true; $('#v-app').hidden = false; aplicarCor('#E30613'); render(); }

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
    '<div class="rlist">' + (vis.map(x => '<div class="rcard"><div class="logo mono" style="background:' + esc(x.cor) + '">' + esc(initials(x.nome)) + '</div><div><h3>' + esc(x.nome) + '<span class="st ' + (x.ativo ? 'on' : 'off') + '">' + (x.ativo ? 'Ativo' : x.suspensoCobranca ? 'Suspenso por atraso' : 'Suspenso') + '</span>' + (x.mensalidade ? '<span class="st on" style="background:none;border:1px solid currentColor">' + brl(x.mensalidade) + '/mês</span>' : '') + '</h3>' +
      '<div class="meta"><span>/r/' + esc(x.slug) + '</span><span>Plano ' + esc(x.plano || 'não definido') + '</span><span>' + x.produtos + ' produtos</span><span>' + x.equipe + ' acessos</span><span>' + x.pedidosHoje + ' pedidos hoje</span><span>' + brl(x.faturamento30) + ' em 30 dias</span><span>' + (x.ultimoPedido ? 'último pedido ' + quando(x.ultimoPedido) : 'sem pedidos em 30 dias') + '</span></div>' +
      '<div class="feat-chips">' + Object.keys(S.recursos).map(k => '<span class="fc' + (x.recursos[k] ? '' : ' off') + '">' + esc(S.recursos[k].replace(/ \(.*\)/, '')) + '</span>').join('') + '</div></div>' +
      '<button class="btn sm" data-act="abrir" data-id="' + x.id + '">Gerenciar</button></div>').join('') || '<p class="note">Nenhum restaurante encontrado.</p>') + '</div>';
}

/* ---------- detalhe ---------- */
const SUBS = [['funcoes', 'Funções e situação'], ['catalogo', 'Catálogo'], ['dados', 'Dados e regras'], ['mesas', 'Mesas, QR e totem'], ['mensalidade', 'Mensalidade'], ['equipe', 'Acessos'], ['pedidos', 'Pedidos recentes'], ['historico', 'Histórico']];
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
  ({ funcoes: subFuncoes, catalogo: subCatalogo, dados: subDados, mesas: subMesas, mensalidade: subMensalidade, equipe: subEquipe, pedidos: subPedidos, historico: subHistorico })[S.sub]();
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
  $('#sub').innerHTML = '<div class="row between" style="margin-top:0"><span class="note" style="margin:0">' + S.produtos.length + ' produtos · alterações ficam registradas no histórico</span>' + (S.formAberto || p || S.imp ? '' : '<div class="row" style="margin:0"><button class="btn sm ghost" data-act="imp-abrir">Importar cardápio</button><button class="btn sm" data-act="novo-prod">+ Novo produto</button></div>') + '</div>' + (S.imp ? blocoImportar() : '') + form + (lista || '<p class="note">Nenhum produto cadastrado.</p>');
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

/* importar cardápio (planilha, foto ou iFood) */
function blocoImportar(){
  const im = S.imp, aba = im.aba;
  const abas = [['planilha', 'Planilha'], ['foto', 'Foto do cardápio'], ['ifood', 'iFood']];
  let corpo = '';
  if (!im.itens){
    if (aba === 'planilha') corpo = '<p class="note" style="margin-top:0">Excel (.xlsx) ou CSV com as colunas <strong>Categoria, Nome, Descrição, Preço</strong> e, se tiver, <strong>Foto</strong> (link). Uma linha só com o nome da categoria também funciona como título.</p>' +
      '<div class="row"><label class="btn sm" for="imp-arq">Escolher planilha</label><input id="imp-arq" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><button class="btn sm ghost" data-act="imp-modelo">Baixar planilha modelo</button></div>';
    if (aba === 'foto') corpo = '<p class="note" style="margin-top:0">Tire uma foto reta e bem iluminada de cada página do cardápio impresso. A leitura é automática (IA) e você confere tudo antes de importar. Pode enviar várias fotos, uma por vez: os itens vão se somando.</p>' +
      '<div class="row"><label class="btn sm" for="imp-foto">Escolher foto</label><input id="imp-foto" type="file" accept="image/*" hidden></div>';
    if (aba === 'ifood') corpo = '<p class="note" style="margin-top:0">Cole o link da loja no iFood (ex.: ifood.com.br/delivery/cidade/nome-do-restaurante/1a2b3c4d-…). Traz categorias, nomes, descrições, preços e fotos. Não é uma integração oficial do iFood e pode parar de funcionar se o iFood mudar o site.</p>' +
      '<div class="row" style="margin:0"><input id="imp-url" placeholder="https://www.ifood.com.br/delivery/..." style="flex:1;min-width:240px"><button class="btn sm" data-act="imp-ifood">Buscar</button></div>' +
      (im.ifoodUrl ? '<div class="warnbox" style="margin-top:10px">Não consegui buscar daqui. Abra <a href="' + esc(im.ifoodUrl) + '" target="_blank" rel="noopener">este endereço</a> no navegador, selecione tudo (Ctrl+A), copie e cole abaixo.<textarea id="imp-json" rows="4" style="margin-top:8px" placeholder="Cole aqui o conteúdo da página"></textarea><div class="row"><button class="btn sm" data-act="imp-colar">Ler o conteúdo colado</button></div></div>' : '');
    corpo += im.carregando ? '<p class="note">' + esc(im.carregando) + '</p>' : '';
  } else {
    const sel = im.itens.filter(x => x.on).length;
    corpo = (im.avisos || []).map(a => '<p class="note" style="margin:0 0 4px">• ' + esc(a) + '</p>').join('') +
      '<div class="card tbl" style="padding:0;max-height:420px;overflow:auto"><table><thead><tr><th><input type="checkbox" id="imp-todos" aria-label="Marcar todos" checked></th><th>Categoria</th><th>Nome</th><th>Descrição</th><th style="text-align:right">Preço</th></tr></thead><tbody>' +
      im.itens.map((x, i) => '<tr><td><input type="checkbox" data-imp-on="' + i + '"' + (x.on ? ' checked' : '') + ' aria-label="Importar ' + esc(x.nome) + '"></td><td><input data-imp="' + i + ':categoria" value="' + esc(x.categoria) + '" style="min-width:110px"></td><td><input data-imp="' + i + ':nome" value="' + esc(x.nome) + '" style="min-width:160px">' + (x.fotoUrl ? '<small class="note" style="display:block">com foto</small>' : '') + '</td><td><input data-imp="' + i + ':descricao" value="' + esc(x.descricao) + '" style="min-width:200px"></td><td style="text-align:right"><input data-imp="' + i + ':preco" type="number" step="0.01" min="0" value="' + x.preco + '" style="width:90px;text-align:right"></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="checks"><label for="imp-at"><input type="checkbox" id="imp-at"> Se já existir um produto com o mesmo nome na mesma categoria, atualizar o preço</label></div>' +
      '<div class="row"><button class="btn" data-act="imp-gravar"' + (sel ? '' : ' disabled') + '>Importar ' + sel + ' ' + (sel === 1 ? 'produto' : 'produtos') + '</button>' + (aba === 'foto' ? '<label class="btn ghost" for="imp-foto">+ Ler outra foto</label><input id="imp-foto" type="file" accept="image/*" hidden>' : '') + '<button class="btn ghost" data-act="imp-limpar">Começar de novo</button></div>';
  }
  return '<h3>Importar cardápio</h3><div class="card"><div class="row between" style="margin:0 0 10px"><div class="seg" role="group" aria-label="De onde importar">' + abas.map(a => '<button type="button" data-act="imp-aba" data-a="' + a[0] + '" aria-pressed="' + (aba === a[0]) + '"' + (im.itens ? ' disabled' : '') + '>' + a[1] + '</button>').join('') + '</div><button class="mini" data-act="imp-fechar">Fechar</button></div>' + corpo + '</div>';
}
async function enviarImp(url, corpo, tipo){
  const opc = { method: 'POST', headers: { Authorization: 'Bearer ' + S.token } };
  if (tipo){ opc.headers['Content-Type'] = tipo; opc.body = corpo; } else { opc.headers['Content-Type'] = 'application/json'; opc.body = JSON.stringify(corpo); }
  const r = await fetch(url, opc), d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.erro || 'Não foi possível ler.'), { dados: d });
  return d;
}
function receberImp(d, fonte){
  const novos = (d.itens || []).map(x => Object.assign({ on: true }, x));
  S.imp.itens = (S.imp.itens || []).concat(novos); S.imp.avisos = (S.imp.avisos || []).concat(d.avisos || []); S.imp.fonte = fonte; S.imp.carregando = '';
  if (!novos.length) toast('Nenhum item com preço encontrado.');
  desenharCatalogo();
}
async function lerArquivoImp(input){
  const f = input.files && input.files[0]; if (!f) return;
  const foto = input.id === 'imp-foto';
  S.imp.carregando = foto ? 'Lendo a foto… (pode levar até 1 minuto)' : 'Lendo a planilha…'; if (!S.imp.itens) desenharCatalogo(); else toast(S.imp.carregando);
  try {
    let corpo = f, tipo = f.type || 'application/octet-stream';
    if (foto && f.size > 3.5 * 1024 * 1024 && window.createImageBitmap){ // reduz fotos grandes antes de enviar
      const bmp = await createImageBitmap(f), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      corpo = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88)); tipo = 'image/jpeg';
    }
    receberImp(await enviarImp('/api/admin/restaurantes/' + S.sel + '/importar/' + (foto ? 'foto' : 'planilha'), corpo, tipo), foto ? 'foto' : 'planilha');
  } catch (e) { S.imp.carregando = ''; toast(e.message); desenharCatalogo(); }
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
    '<p class="note">"Delivery ligado pelo dono" é o botão que o restaurante controla. Para bloquear o delivery de vez, desligue a função em Funções e situação.</p><div class="row"><button class="btn" type="submit">Salvar dados</button></div></div></form>' + blocoDominio(c);
}

/* mesas, QR Codes e totem */
function qrSvg(texto){
  if (typeof qrcode !== 'function' || !texto) return '<p class="note">QR indisponível.</p>';
  const q = qrcode(0, 'M'); q.addData(texto, 'Byte'); q.make(); const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + 3) + ' ' + (r + 3) + 'h1v1h-1z';
  return '<svg class="qr" viewBox="0 0 ' + (n + 6) + ' ' + (n + 6) + '" role="img" aria-label="QR Code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="' + d + '" fill="#111111"/></svg>';
}
async function subMesas(){
  $('#sub').innerHTML = '<p class="note">Carregando…</p>';
  try { const d = await chamar('GET', '/api/admin/restaurantes/' + S.sel + '/mesas'); S.mesas = d.mesas; S.totem = d.totem; } catch (e) { $('#sub').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  desenharMesas();
}
function desenharMesas(){
  const r = S.det.restaurante, rc = r.recursos || {}, base = r.dominio && rc.dominio ? 'https://' + r.dominio : location.origin + '/r/' + r.slug, salao = base + '/salao';
  const off = k => rc[k] === false ? ' <span class="badge b-warn">função desligada</span>' : '';
  const totemUrl = S.totem ? base + '/totem?t=' + encodeURIComponent(S.totem) + (S.totemImp ? '&imprimir=1' : '') : '';
  const link = (url, txt) => '<div class="code">' + esc(url) + '</div><div class="row"><button class="btn sm" data-act="copiar" data-v="' + esc(url) + '">Copiar link</button><a class="btn sm ghost" href="' + esc(url) + '" target="_blank" rel="noopener">' + (txt || 'Abrir') + '</a>';
  $('#sub').innerHTML = '<p class="note" style="margin-top:0">Os links e QR Codes deste restaurante. O dono vê tudo isso no painel e pode adicionar mesas; remover mesas e trocar códigos é só aqui. Toda troca fica registrada no histórico.</p>' +
    '<h3>Os três sites do restaurante</h3><div class="card"><ul class="sites">' +
    '<li><strong>Pedido online (de casa)</strong><span>Início, cardápio, carrinho e acompanhamento, com entrega ou retirada.</span><a href="' + esc(base) + '" target="_blank" rel="noopener">' + esc(base) + '</a></li>' +
    '<li><strong>Cardápio do salão (no restaurante)</strong><span>Só cardápio e carrinho, com barra lateral. Pela mesa, abre pelo QR de cada mesa; sem mesa, o cliente pede para retirar no balcão.</span><a href="' + esc(salao) + '" target="_blank" rel="noopener">' + esc(salao) + '</a></li>' +
    '<li><strong>Painel do restaurante (equipe)</strong><span>Pedidos em tempo real, produtos, estoque, histórico e financeiro.</span><a href="' + esc(location.origin + '/painel') + '" target="_blank" rel="noopener">' + esc(location.origin + '/painel') + '</a></li></ul></div>' +
    '<h3>Link do delivery</h3><div class="card dlink"><div class="qrc">' + qrSvg(base) + '<strong>Peça pelo site</strong><span>' + esc(r.nome) + '</span></div><div style="flex:1;min-width:0"><p style="margin:0 0 6px">Para a bio do Instagram, o WhatsApp Business, o Google e os panfletos.</p>' + link(base) + '</div></div></div>' +
    '<h3>Cardápio do salão</h3><div class="card dlink"><div class="qrc">' + qrSvg(salao) + '<strong>Nosso cardápio</strong><span>' + esc(r.nome) + '</span></div><div style="flex:1;min-width:0"><p style="margin:0 0 6px">Para a entrada, o balcão ou a vitrine. O cliente vê o cardápio e pode pedir para retirar no balcão.</p>' + link(salao) + '</div></div></div>' +
    '<h3>Modo totem (autoatendimento)' + off('totem') + '</h3><div class="card dlink"><div class="qrc">' + qrSvg(totemUrl) + '<strong>Totem</strong><span>aponte a câmera do tablet</span></div><div style="flex:1;min-width:0">' +
    '<p style="margin:0 0 6px">Abra este link no tablet ou totem do balcão. O pedido chega no painel como <strong>Totem</strong>, com o número da senha.</p>' +
    '<label class="ck" for="tt-imp" style="font-weight:600"><input type="checkbox" id="tt-imp"' + (S.totemImp ? ' checked' : '') + '> Imprimir a senha do cliente numa impressora ligada ao totem</label>' +
    link(totemUrl, 'Abrir o totem') + '<button class="btn sm ' + (S.confirmar === 'totem' ? 'danger' : 'ghost') + '" data-act="totem-codigo">' + (S.confirmar === 'totem' ? 'Confirmar: o link antigo para de funcionar' : 'Gerar novo código') + '</button></div>' +
    '<p class="note">No tablet: abra no Chrome, toque em ⋮ → “Adicionar à tela inicial” e abra pelo ícone, em tela cheia.</p></div></div>' +
    '<h3>QR Codes das mesas' + off('mesa') + '</h3><div class="card"><div class="row" style="margin:0;align-items:flex-end"><div><label for="m-qtd" style="margin-top:0">Quantidade de mesas</label><input id="m-qtd" type="number" min="0" max="200" value="' + S.mesas.length + '" style="width:120px"></div><button class="btn sm" data-act="salvar-mesas">Atualizar mesas</button></div>' +
    '<p class="note">Cada QR leva um código secreto da mesa: só quem está no restaurante consegue pedir por ela. Se um QR for copiado ou fotografado, gere um novo código e imprima de novo.</p></div>' +
    '<div class="qrs">' + S.mesas.map(m => { const url = base + '/mesa/' + m.numero + '?t=' + encodeURIComponent(m.token); return '<div class="qrc">' + qrSvg(url) + '<strong>Mesa ' + pad(m.numero) + '</strong><span>' + esc(r.nome) + '</span><span>Aponte a câmera para ver o cardápio e pedir</span>' +
      '<div class="row" style="justify-content:center;margin-top:8px"><button class="mini" data-act="copiar" data-v="' + esc(url) + '">Copiar link</button><button class="mini' + (S.confirmar === 'm' + m.numero ? ' danger' : '') + '" data-act="novo-codigo" data-n="' + m.numero + '">' + (S.confirmar === 'm' + m.numero ? 'Confirmar: o QR antigo para de funcionar' : 'Gerar novo código') + '</button></div></div>'; }).join('') + '</div>';
}

/* mensalidade */
async function subMensalidade(){
  $('#sub').innerHTML = '<p class="note">Carregando…</p>';
  try { S.cob = await chamar('GET', '/api/admin/restaurantes/' + S.sel + '/cobranca'); } catch (e) { $('#sub').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; return; }
  const d = S.cob, cb = d.cobranca || {}, data = x => String(x || '').slice(0, 10).split('-').reverse().join('/');
  const st = f => f.status === 'paga' ? '<span class="badge b-good">Paga' + (f.forma === 'manual' ? ' (manual)' : '') + '</span>' : f.status === 'cancelada' ? '<span class="badge b-neu">Cancelada</span>' : f.atrasada ? '<span class="badge b-crit">Vencida</span>' : '<span class="badge b-warn">Em aberto</span>';
  $('#sub').innerHTML = (d.suspensoCobranca ? '<p class="warnbox" style="margin-top:0">Restaurante suspenso automaticamente por atraso. Volta sozinho quando a fatura for paga (Pix ou baixa manual).</p>' : '') +
    (d.provedor !== 'mercadopago' ? '<p class="note" style="margin-top:0">Pix das faturas em modo de demonstração (COBRANCA_PROVEDOR=demo). Para receber de verdade, configure COBRANCA_PROVEDOR=mercadopago e COBRANCA_MP_TOKEN no servidor.</p>' : '') +
    (!d.emailAtivo ? '<p class="note">O envio de e-mail está desligado: copie o link da fatura e mande para o dono.</p>' : '') +
    '<form id="f-cob" class="card" novalidate><label class="tg" for="cb-ativa"><span>Cobrar mensalidade deste restaurante<small>A fatura do mês é criada 7 dias antes do vencimento e o dono recebe o link por e-mail. Passou o vencimento + tolerância sem pagar, o restaurante é suspenso sozinho e volta quando paga.</small></span><input type="checkbox" class="switch" id="cb-ativa"' + (cb.ativa ? ' checked' : '') + '></label>' +
    '<div class="grid3"><div><label for="cb-valor">Valor (R$)</label><input id="cb-valor" type="number" min="0" step="0.01" value="' + (cb.valor || '') + '" placeholder="149,90"></div><div><label for="cb-dia">Dia do vencimento</label><input id="cb-dia" type="number" min="1" max="28" value="' + (cb.dia || 10) + '"></div><div><label for="cb-tol">Tolerância (dias)</label><input id="cb-tol" type="number" min="0" max="30" value="' + (cb.tolerancia == null ? 5 : cb.tolerancia) + '"></div></div>' +
    '<div class="row"><button class="btn" type="submit">Salvar mensalidade</button>' + (cb.ativa ? '<button class="btn ghost" type="button" data-act="gerar-fatura">Gerar a fatura deste mês agora</button>' : '') + '</div></form>' +
    '<h3>Faturas</h3><div class="card tbl" style="padding:0"><table><thead><tr><th>Mês</th><th>Vencimento</th><th style="text-align:right">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
    (d.faturas.map(f => '<tr><td>' + esc(f.mes) + '</td><td>' + data(f.vencimento) + '</td><td style="text-align:right">' + brl(f.valor) + '</td><td>' + st(f) + (f.pagoEm ? '<br><small>' + quando(f.pagoEm) + (f.obs ? ' · ' + esc(f.obs) : '') + '</small>' : '') + '</td><td><div class="row" style="margin:0;justify-content:flex-end">' +
      (f.status === 'aberta' ? '<button class="mini" data-act="copiar" data-v="' + esc(f.link) + '">Copiar link</button>' +
        (S.confirmar === 'pg' + f.id ? '<input id="fp-obs" placeholder="Como pagou? (opcional)" style="max-width:180px"><button class="mini danger" data-act="fatura-paga" data-id="' + f.id + '">Confirmar baixa</button>' : '<button class="mini" data-act="fatura-paga" data-id="' + f.id + '">Dar baixa</button>') +
        '<button class="mini' + (S.confirmar === 'cf' + f.id ? ' danger' : '') + '" data-act="fatura-cancelar" data-id="' + f.id + '">' + (S.confirmar === 'cf' + f.id ? 'Confirmar cancelamento' : 'Cancelar') + '</button>' : '') + '</div></td></tr>').join('') || '<tr><td colspan="5" class="note">Nenhuma fatura ainda.</td></tr>') + '</tbody></table></div>';
}

/* domínio próprio */
function blocoDominio(c){
  const rc = c.recursos || {};
  if (!rc.dominio) return '<h3>Domínio próprio</h3><div class="card"><p class="note" style="margin:0">Função do plano mais caro. Ligue “Domínio próprio” em Funções e situação para configurar (ex.: pizzariadoze.com.br).</p></div>';
  return '<h3>Domínio próprio</h3><form id="f-dom" class="card" novalidate><label for="dm-d" style="margin-top:0">Domínio do restaurante</label><div class="row" style="margin:0"><input id="dm-d" value="' + esc(c.dominio || '') + '" placeholder="pizzariadoze.com.br" style="flex:1;min-width:220px"><button class="btn sm" type="submit">Salvar</button>' + (c.dominio ? '<button class="btn sm ghost" type="button" data-act="dom-verificar">Verificar DNS</button>' : '') + '</div><p class="note" id="dm-res"></p>' +
    '<ol class="note" style="padding-left:18px;margin:6px 0 0"><li>No <strong>Render</strong>: Settings → Custom Domains → Add, com o domínio (e o www, se quiser).</li><li>No <strong>registro do domínio</strong> (Registro.br, GoDaddy…): crie um registro <strong>CNAME</strong> do domínio (ou do www) apontando para <strong>' + esc(S.alvoDominio || 'o endereço do serviço no Render') + '</strong>. Domínio sem www no Registro.br: use o registro A/ALIAS indicado pelo Render.</li><li>Espere o Render mostrar “Verified” (o certificado https sai sozinho). Depois, imprima de novo os QR Codes: eles passam a usar o domínio.</li></ol></form>';
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
      (l.map(p => '<tr><td>#' + N(p.numero) + '</td><td>' + quando(p.createdAt) + '</td><td>' + (p.tipo === 'mesa' ? 'Mesa ' + pad(p.mesa) : p.tipo === 'delivery' ? 'Entrega · ' + esc(p.entrega && p.entrega.bairro) : 'Retirada') + '</td><td>' + esc(p.cliente && p.cliente.nome) + '</td><td style="text-align:right">' + brl(p.total) + '</td><td>' + esc(pagTxt(p)) + (p.pagamento.pago ? ' · pago' : '') + '</td><td>' + C.STATUS[p.status] + '</td></tr>').join('') || '<tr><td colspan="7" class="note">Nenhum pedido ainda.</td></tr>') + '</tbody></table></div>';
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
  if (!['remover-prod', 'pedir-senha', 'salvar-senha', 'novo-codigo', 'totem-codigo', 'fatura-paga', 'fatura-cancelar'].includes(a)) S.confirmar = null;
  const base = () => '/api/admin/restaurantes/' + S.sel;
  switch (a){
    case 'sair': sair(); break;
    case 'aba': S.aba = el.dataset.t; S.sel = null; render(); break;
    case 'novo': S.novo = true; desenharLista(); setTimeout(() => $('#n-nome').focus(), 30); break;
    case 'cancelar-novo': S.novo = false; desenharLista(); break;
    case 'abrir': S.imp = null; S.sel = id; S.sub = 'funcoes'; S.editId = null; S.formAberto = false; renderDetalhe(); window.scrollTo(0, 0); break;
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
    case 'salvar-mesas': try { S.mesas = (await chamar('POST', base() + '/mesas', { quantidade: $('#m-qtd').value })).mesas; await carregarDetalhe(); toast('Mesas atualizadas: ' + S.mesas.length); desenharMesas(); } catch (err) { toast(err.message); } break;
    case 'novo-codigo': { const n = el.dataset.n; if (S.confirmar !== 'm' + n){ S.confirmar = 'm' + n; desenharMesas(); break; } S.confirmar = null; try { const m = (await chamar('POST', base() + '/mesas/' + n + '/novo-codigo')).mesa; S.mesas = S.mesas.map(x => x.numero === m.numero ? m : x); toast('Novo código gerado. Imprima o QR da Mesa ' + pad(n) + ' de novo.'); desenharMesas(); } catch (err) { toast(err.message); } break; }
    case 'totem-codigo': if (S.confirmar !== 'totem'){ S.confirmar = 'totem'; desenharMesas(); break; } S.confirmar = null; try { S.totem = (await chamar('POST', base() + '/totem/novo-codigo')).token; toast('Novo link do totem gerado. Abra o link novo no tablet.'); desenharMesas(); } catch (err) { toast(err.message); } break;
    case 'gerar-fatura': try { await chamar('POST', base() + '/faturas'); toast('Fatura gerada e enviada ao dono'); subMensalidade(); } catch (err) { toast(err.message); } break;
    case 'fatura-paga': if (S.confirmar !== 'pg' + id){ S.confirmar = 'pg' + id; subMensalidade().then(() => { const i = $('#fp-obs'); if (i) i.focus(); }); break; }
      try { const o = $('#fp-obs') ? $('#fp-obs').value : ''; S.confirmar = null; const d = await chamar('POST', '/api/admin/faturas/' + id + '/paga', { obs: o }); toast(d.situacao === 'reativado' ? 'Baixa feita. Restaurante reativado.' : 'Baixa feita'); await carregarDetalhe(); subMensalidade(); } catch (err) { toast(err.message); } break;
    case 'fatura-cancelar': if (S.confirmar !== 'cf' + id){ S.confirmar = 'cf' + id; subMensalidade(); break; } S.confirmar = null; try { await chamar('POST', '/api/admin/faturas/' + id + '/cancelar'); toast('Fatura cancelada'); await carregarDetalhe(); subMensalidade(); } catch (err) { toast(err.message); } break;
    case 'imp-abrir': S.imp = { aba: 'planilha' }; desenharCatalogo(); break;
    case 'imp-fechar': S.imp = null; desenharCatalogo(); break;
    case 'imp-limpar': S.imp = { aba: S.imp.aba }; desenharCatalogo(); break;
    case 'imp-aba': S.imp.aba = el.dataset.a; S.imp.ifoodUrl = null; desenharCatalogo(); break;
    case 'imp-modelo': { try { const r = await fetch('/api/admin/modelo-cardapio.xlsx', { headers: { Authorization: 'Bearer ' + S.token } }); const b = await r.blob(), a = document.createElement('a'), u = URL.createObjectURL(b); a.href = u; a.download = 'modelo-cardapio.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); } catch (err) { toast('Não foi possível baixar.'); } break; }
    case 'imp-ifood': { const u = $('#imp-url').value.trim(); S.imp.carregando = 'Buscando no iFood…'; desenharCatalogo(); try { receberImp(await enviarImp('/api/admin/restaurantes/' + S.sel + '/importar/ifood', { url: u }), 'iFood'); } catch (err) { S.imp.carregando = ''; S.imp.ifoodUrl = err.dados && err.dados.ifoodUrl; toast(err.message); desenharCatalogo(); const i = $('#imp-url'); if (i) i.value = u; } break; }
    case 'imp-colar': { try { receberImp(await enviarImp('/api/admin/restaurantes/' + S.sel + '/importar/ifood', { json: $('#imp-json').value }), 'iFood'); } catch (err) { toast(err.message); } break; }
    case 'imp-gravar': { const itens = S.imp.itens.filter(x => x.on); el.disabled = true; el.textContent = 'Importando…';
      try { const d = await chamar('POST', base() + '/importar', { itens, atualizarPrecos: $('#imp-at').checked, fonte: S.imp.fonte }); toast(d.criados + ' produto(s) importados' + (d.atualizados ? ', ' + d.atualizados + ' preço(s) atualizados' : '') + (d.ignorados ? ', ' + d.ignorados + ' já existiam' : '')); S.imp = null; subCatalogo(); }
      catch (err) { toast(err.message); el.disabled = false; } break; }
    case 'dom-verificar': { const o = $('#dm-res'); o.textContent = 'Conferindo o DNS…'; try { const d = await chamar('POST', base() + '/dominio/verificar'); o.textContent = (d.ok ? '✓ ' : '') + d.mensagem; } catch (err) { o.textContent = err.message; } break; }
    case 'ativo-dev': try { await chamar('PATCH', '/api/admin/devs/' + id, { ativo: el.dataset.v === '1' }); renderDevs(); } catch (err) { toast(err.message); } break;
  }
});
document.addEventListener('input', e => { if (e.target.id === 'r-q'){ S.q = e.target.value; const pos = e.target.selectionStart; desenharLista(); const i = $('#r-q'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {} } });
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'imp-arq' || t.id === 'imp-foto'){ lerArquivoImp(t); return; }
  if (t.id === 'imp-todos'){ S.imp.itens.forEach(x => { x.on = t.checked; }); desenharCatalogo(); return; }
  if (t.dataset && t.dataset.impOn !== undefined){ S.imp.itens[+t.dataset.impOn].on = t.checked; desenharCatalogo(); return; }
  if (t.dataset && t.dataset.imp){ const [i, k] = t.dataset.imp.split(':'); S.imp.itens[+i][k] = k === 'preco' ? parseFloat(t.value) || 0 : t.value; return; }
  if (t.id === 'tt-imp'){ S.totemImp = t.checked; desenharMesas(); return; }
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
    if (id === 'f-cob'){ await chamar('PUT', base + '/cobranca', { ativa: $('#cb-ativa').checked, valor: v('cb-valor'), dia: v('cb-dia'), tolerancia: v('cb-tol') }); await carregarDetalhe(); toast('Mensalidade salva'); subMensalidade(); }
    if (id === 'f-dom'){ const d = await chamar('PUT', base + '/dominio', { dominio: v('dm-d') }); S.alvoDominio = d.alvo; await carregarDetalhe(); toast(d.dominio ? 'Domínio salvo: ' + d.dominio : 'Domínio removido'); desenharDetalhe(); }
    if (id === 'f-dev'){ await chamar('POST', '/api/admin/devs', { nome: v('d-nome'), email: v('d-email'), senha: v('d-senha') }); toast('Dev adicionado'); renderDevs(); }
  } catch (err) { toast(err.message); }
});

iniciar();
})();
