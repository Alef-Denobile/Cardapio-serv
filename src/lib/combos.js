// Combos e pizza meio a meio (função extra "combos", desligada por padrão).
// São dois tipos novos de opção de produto, que buscam as escolhas em outra categoria do cardápio:
//   { tipo: 'combo',   nome: 'Escolha a bebida', categoria: 'Bebidas', qtd: 1 }
//      -> o cliente escolhe exatamente "qtd" itens da categoria, já incluídos no preço do combo
//   { tipo: 'sabores', nome: 'Sabores', categoria: 'Pizzas', max: 2, regra: 'maior' | 'media' }
//      -> o cliente escolhe de 1 até "max" sabores; o preço é o do sabor mais caro (ou a média) somado ao preço base
// O estoque (ficha técnica) dos itens escolhidos também é baixado: no meio a meio, cada sabor conta a sua fração.
const { recursosDe } = require('./recursos');

const COMPOSTOS = ['combo', 'sabores'];
const composto = p => (p.opcoes || []).some(o => COMPOSTOS.includes(o.tipo));

// Preenche as escolhas das opções compostas com os produtos da categoria (mesma ordem no site e no servidor)
function expandir(produtos, esgotados) {
  const simples = produtos.filter(p => !composto(p));
  const porCat = new Map();
  simples.forEach(p => { if (!porCat.has(p.categoria)) porCat.set(p.categoria, []); porCat.get(p.categoria).push(p); });
  porCat.forEach(l => l.sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome, 'pt-BR')));
  return produtos.map(p => {
    if (!composto(p)) return p;
    const opcoes = (p.opcoes || []).map(o => {
      if (!COMPOSTOS.includes(o.tipo)) return o;
      const itens = (porCat.get(o.categoria) || []).filter(x => x.id !== p.id);
      return Object.assign({}, o, { escolhas: itens.map(x => ({ nome: x.nome, preco: o.tipo === 'sabores' ? Number(x.preco) : 0, produto: x.id, esgotado: !!(x.esgotado || (esgotados && esgotados.has(x.id))) })) });
    });
    // combo sem itens suficientes para escolher (todos esgotados) fica esgotado também
    const semItens = opcoes.some(o => COMPOSTOS.includes(o.tipo) && o.escolhas.filter(e => !e.esgotado).length < regra(o).min);
    return Object.assign({}, p, { opcoes, esgotado: p.esgotado || semItens });
  });
}

// Esconde os produtos compostos quando a função está desligada
const filtrar = (rest, produtos) => recursosDe(rest).combos ? produtos : produtos.filter(p => !composto(p));

function regra(o) {
  if (o.tipo === 'um') return { min: 1, max: 1 };
  if (o.tipo === 'combo') { const q = Math.max(1, Math.min(5, o.qtd || 1)); return { min: q, max: q }; }
  if (o.tipo === 'sabores') return { min: 1, max: Math.max(2, Math.min(4, o.max || 2)) };
  return { min: 0, max: 99 };
}

module.exports = { COMPOSTOS, composto, expandir, filtrar, regra };
