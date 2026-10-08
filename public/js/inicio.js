/* Tela de entrada do site: escolher entre pedir em casa (site de pedidos) e o menu do salão */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
(async function(){
  try {
    const slug = (await (await fetch('/api/site')).json()).slug;
    if (!slug){ $('#marca').innerHTML = '<p class="ini-carr">Nenhum restaurante cadastrado ainda.</p>'; return; }
    $('#op-online').href = '/r/' + slug; $('#op-salao').href = '/r/' + slug + '/salao';
    const R = (await (await fetch('/api/r/' + encodeURIComponent(slug))).json()).restaurante;
    document.title = R.nome;
    if (/^#[0-9a-f]{6}$/i.test(R.cor || '')) document.documentElement.style.setProperty('--cor', R.cor);
    if (R.capaUrl) $('#ini').style.setProperty('--capa', 'url("' + R.capaUrl.replace(/"/g, '') + '")');
    const tipos = (R.tipos || []).filter(t => t !== 'mesa');
    if (!tipos.length) $('#op-online').hidden = true;
    $('#marca').innerHTML = (R.logoUrl ? '<img class="ini-logo" src="' + esc(R.logoUrl) + '" alt="">' : '<span class="ini-logo mono" aria-hidden="true">' + esc(R.nome.split(/\s+/).map(w => w[0]).join('').slice(0, 2)) + '</span>') +
      '<h1>' + esc(R.nome) + '</h1>' + (R.frase ? '<p>' + esc(R.frase) + '</p>' : '') +
      '<span class="ini-status ' + (R.aberto ? 'on' : 'off') + '">' + (R.aberto ? 'Aberto agora · até ' + esc(R.fecha) : 'Fechado agora · abre às ' + esc(R.abre)) + '</span>';
  } catch (e) { $('#marca').innerHTML = '<p class="ini-carr">Não foi possível carregar. Atualize a página.</p>'; }
})();
})();
