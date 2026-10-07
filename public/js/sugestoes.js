/* "Peça também": escolhe o que sugerir no carrinho.
   1º os produtos que o dono marcou como sugestão; se não marcou nenhum, complementos (bebidas, sobremesas, porções)
   de categorias que ainda não estão no carrinho. Um por categoria, destaques e com foto primeiro. */
(function (w) {
  'use strict';
  const COMPLEMENTO = /bebid|suco|refri|drink|sobremes|doce|porç|porc|batata|acompanh|entrada|petisc/i;
  function escolher(P, idsNoCarrinho, n) {
    n = n || 4;
    const ids = new Set(idsNoCarrinho), catsNo = new Set(P.filter(p => ids.has(p.id)).map(p => p.categoria));
    const livres = P.filter(p => !p.esgotado && !ids.has(p.id));
    let base = livres.filter(p => p.sugerir);
    if (!base.length) base = livres.filter(p => COMPLEMENTO.test(p.categoria) && !catsNo.has(p.categoria));
    if (!base.length) base = livres.filter(p => !catsNo.has(p.categoria));
    base = base.slice().sort((a, b) => (catsNo.has(a.categoria) - catsNo.has(b.categoria)) || (b.destaque - a.destaque) || (!!b.fotoUrl - !!a.fotoUrl) || a.preco - b.preco);
    const out = [], vistas = new Set();
    for (const p of base) if (!vistas.has(p.categoria)) { out.push(p); vistas.add(p.categoria); if (out.length >= n) return out; }
    for (const p of base) if (!out.includes(p)) { out.push(p); if (out.length >= n) break; }
    return out;
  }
  w.Sugestoes = { escolher };
})(window);
