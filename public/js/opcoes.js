/* Regras das opções de um produto, iguais às do servidor (src/lib/pedidos.js e src/lib/combos.js).
   Tipos: "um" (escolha 1), "varios" (adicionais), "combo" (escolha N itens de outra categoria, já incluídos)
   e "sabores" (meio a meio: de 1 a N sabores, preço do mais caro ou a média). */
(function (w) {
  'use strict';
  function regra(o) {
    if (o.tipo === 'um') return { min: 1, max: 1 };
    if (o.tipo === 'combo') { const q = Math.max(1, Math.min(5, o.qtd || 1)); return { min: q, max: q }; }
    if (o.tipo === 'sabores') return { min: 1, max: Math.max(2, Math.min(4, o.max || 2)) };
    return { min: 0, max: 99 };
  }
  const radio = o => regra(o).max === 1;
  const livres = o => o.escolhas.map((e, i) => e.esgotado ? -1 : i).filter(i => i >= 0);
  function rotulo(o) {
    const r = regra(o);
    if (o.tipo === 'sabores') return 'escolha até ' + r.max + ' sabores' + (o.regra === 'media' ? ' · preço pela média' : ' · vale o preço do mais caro');
    if (o.tipo === 'combo') return r.max === 1 ? 'escolha 1 · incluído' : 'escolha ' + r.max + ' · incluídos';
    return o.tipo === 'um' ? 'escolha 1' : 'opcional';
  }
  function inicial(p) {
    const sel = {};
    (p.opcoes || []).forEach((o, oi) => { const r = regra(o); sel[oi] = r.min ? livres(o).slice(0, o.tipo === 'sabores' ? 1 : r.min) : []; });
    return sel;
  }
  // Marca/desmarca respeitando o máximo (passou do máximo: sai a escolha mais antiga)
  function alternar(p, sel, oi, ei) {
    const o = p.opcoes[oi], r = regra(o), atual = (sel[oi] || []).slice();
    if (o.escolhas[ei] && o.escolhas[ei].esgotado) return sel;
    if (r.max === 1) sel[oi] = [ei];
    else { const i = atual.indexOf(ei); if (i >= 0) { if (atual.length > r.min || o.tipo === 'varios') atual.splice(i, 1); } else { atual.push(ei); while (atual.length > r.max) atual.shift(); } sel[oi] = atual; }
    return sel;
  }
  function validar(p, sel) {
    for (let oi = 0; oi < (p.opcoes || []).length; oi++) {
      const o = p.opcoes[oi], r = regra(o), n = ((sel && sel[oi]) || []).length;
      if (n < r.min) return o.tipo === 'combo' ? 'Escolha ' + r.min + ' em “' + o.nome + '”.' : o.tipo === 'sabores' ? 'Escolha pelo menos 1 sabor.' : 'Escolha uma opção em “' + o.nome + '”.';
    }
    return '';
  }
  function unit(p, sel) {
    let v = p.preco;
    (p.opcoes || []).forEach((o, oi) => {
      const s = ((sel && sel[oi]) || []).map(x => o.escolhas[x]).filter(Boolean);
      if (o.tipo === 'sabores') { if (s.length) v += o.regra === 'media' ? Math.round(s.reduce((a, e) => a + e.preco, 0) / s.length * 100) / 100 : Math.max.apply(null, s.map(e => e.preco)); }
      else s.forEach(e => { v += e.preco || 0; });
    });
    return Math.round(v * 100) / 100;
  }
  function nomes(p, sel) {
    return (p.opcoes || []).flatMap((o, oi) => {
      const s = ((sel && sel[oi]) || []).map(x => o.escolhas[x]).filter(Boolean);
      if (o.tipo === 'sabores' && s.length > 1) return s.map(e => '1/' + s.length + ' ' + e.nome);
      return s.map(e => e.nome);
    });
  }
  // Menor preço para mostrar no cardápio ("a partir de"): no meio a meio, o sabor mais barato
  function aPartir(p) {
    let v = p.preco;
    (p.opcoes || []).forEach(o => { if (o.tipo === 'sabores') { const ps = o.escolhas.filter(e => !e.esgotado).map(e => e.preco); if (ps.length) v += Math.min.apply(null, ps); } });
    return Math.round(v * 100) / 100;
  }
  const variavel = p => (p.opcoes || []).some(o => o.tipo === 'sabores' || o.escolhas.some(e => e.preco));
  // HTML dos campos (usado pelo site: inputs de verdade, lidos pelo formulário)
  function campos(p, esc, brl) {
    const ini = inicial(p);
    return (p.opcoes || []).map((o, oi) => '<fieldset data-oi="' + oi + '" data-max="' + regra(o).max + '"><legend>' + esc(o.nome) + ' <small>' + rotulo(o) + '</small></legend>' + o.escolhas.map((e, ei) =>
      '<label class="op' + (e.esgotado ? ' off' : '') + '"><input type="' + (radio(o) ? 'radio' : 'checkbox') + '" name="o' + oi + '" value="' + ei + '"' + (ini[oi].includes(ei) ? ' checked' : '') + (e.esgotado ? ' disabled' : '') + '><span>' + esc(e.nome) + (e.esgotado ? ' <small>(esgotado)</small>' : '') + '</span><b>' +
        (o.tipo === 'sabores' ? brl(e.preco) : o.tipo === 'combo' ? '' : e.preco ? '+ ' + brl(e.preco) : '') + '</b></label>').join('') + '</fieldset>').join('');
  }
  // Ao marcar uma caixa num grupo com limite (ex.: até 2 sabores), desmarca a mais antiga
  document.addEventListener('change', e => {
    const i = e.target; if (!(i instanceof HTMLInputElement) || i.type !== 'checkbox') return;
    const fs = i.closest('fieldset[data-max]'); if (!fs) return;
    if (i.checked) i.dataset.ord = String(Date.now());
    const max = +fs.dataset.max, on = Array.from(fs.querySelectorAll('input:checked'));
    if (on.length > max) on.filter(x => x !== i).sort((a, b) => (+a.dataset.ord || 0) - (+b.dataset.ord || 0)).slice(0, on.length - max).forEach(x => { x.checked = false; });
  }, true);
  w.Opcoes = { regra, radio, rotulo, inicial, alternar, validar, unit, nomes, aPartir, variavel, campos };
})(window);
