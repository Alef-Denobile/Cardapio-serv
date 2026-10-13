// Tipo do estabelecimento: lanchonete, sorveteria ou restaurante.
// O tipo é escolhido pela equipe de devs ao criar o restaurante e serve de PONTO DE PARTIDA:
// já liga as funções certas e cria as categorias iniciais. Depois tudo pode ser mudado normalmente
// (funções na área de devs, categorias no painel do dono). Trocar o tipo depois não mexe no que já existe.
const TIPOS = {
  lanchonete: {
    nome: 'Lanchonete',
    descricao: 'Lanches, combos e porções. Pedido no balcão (totem), retirada e delivery.',
    categorias: ['Lanches', 'Combos', 'Porções', 'Bebidas', 'Sobremesas'],
    mesas: 0, taxaServico: 0, cor: '#E30613',
    ligar: ['retirada', 'delivery', 'totem', 'combos'],
    desligar: ['mesa', 'chamados']
  },
  sorveteria: {
    nome: 'Sorveteria',
    descricao: 'Sorvetes, açaí e milkshakes. Pedido no balcão (totem), retirada e delivery.',
    categorias: ['Sorvetes', 'Açaí', 'Milkshakes', 'Picolés', 'Bebidas'],
    mesas: 0, taxaServico: 0, cor: '#E8508A',
    ligar: ['retirada', 'delivery', 'totem'],
    desligar: ['mesa', 'chamados', 'combos']
  },
  restaurante: {
    nome: 'Restaurante',
    descricao: 'Pedido na mesa pelo QR Code, chamar o garçom, pedir a conta e taxa de serviço. Também tem pedido online.',
    categorias: ['Entradas', 'Pratos principais', 'Massas', 'Bebidas', 'Sobremesas'],
    mesas: 10, taxaServico: 10, cor: '#8C2F39',
    ligar: ['mesa', 'chamados', 'retirada', 'delivery'],
    desligar: ['totem', 'combos']
  }
};
const PADRAO = 'restaurante';
const valido = t => Object.prototype.hasOwnProperty.call(TIPOS, t);
const tipoDe = t => valido(t) ? t : PADRAO;

// Liga e desliga as funções do tipo (colunas rec_*)
async function aplicarFuncoes(c, rid, tipo) {
  const t = TIPOS[tipoDe(tipo)], sets = [];
  t.ligar.forEach(k => sets.push('rec_' + k + ' = true'));
  t.desligar.forEach(k => sets.push('rec_' + k + ' = false'));
  await c.query('UPDATE restaurantes SET ' + sets.join(', ') + ' WHERE id = $1', [rid]);
}

// Para a tela da área de devs
const lista = () => Object.keys(TIPOS).map(k => ({ id: k, nome: TIPOS[k].nome, descricao: TIPOS[k].descricao, categorias: TIPOS[k].categorias, mesas: TIPOS[k].mesas, ligar: TIPOS[k].ligar }));

module.exports = { TIPOS, PADRAO, valido, tipoDe, aplicarFuncoes, lista };
