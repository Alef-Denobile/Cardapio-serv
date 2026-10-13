// Demonstrações prontas, uma de cada tipo de estabelecimento:
//   Sabor da Casa  (lanchonete / hamburgueria) -> /r/sabor-da-casa
//   Gelato & Cia   (sorveteria)                -> /r/gelato-e-cia
//   Cantina Bella  (restaurante italiano)      -> /r/cantina-bella
// Cada uma tem cardápio com fotos, equipe, estoque, 30 dias de pedidos de exemplo (relatórios) e avaliações.
const bcrypt = require('bcryptjs');
const repo = require('./repo');
const { criarRestaurante } = require('./criarRestaurante');

const SLUG = 'sabor-da-casa';
const SENHA = 'sabordacasa123';
const EMAILS = { dono: 'dono@sabordacasa.com', cozinha: 'cozinha@sabordacasa.com', carlos: 'carlos@sabordacasa.com', rafa: 'rafa@sabordacasa.com' };
// Exemplos de versões anteriores, apagados quando o novo é criado
const ANTIGOS = ['casa-jabuticaba', 'pizzaria-do-ze', 'mexican-gourmet', 'padaria-da-maria', 'fitness-center', 'hotsoup', 'sorveteria-da-polar', 'burger-monstro'];

const F = n => '/img/chef/' + n + '.jpg';
const TAMANHO = { nome: 'Tamanho', tipo: 'um', escolhas: [{ nome: 'Média (6 fatias)', preco: 0 }, { nome: 'Grande (8 fatias)', preco: 14 }] };
const BORDA = { nome: 'Borda', tipo: 'um', escolhas: [{ nome: 'Tradicional', preco: 0 }, { nome: 'Recheada com catupiry', preco: 9 }] };
const PONTO = { nome: 'Ponto da carne', tipo: 'um', escolhas: [{ nome: 'Ao ponto', preco: 0 }, { nome: 'Mal passado', preco: 0 }, { nome: 'Bem passado', preco: 0 }] };
const ADIC_BURGER = { nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Bacon extra', preco: 6 }, { nome: 'Cheddar extra', preco: 5 }, { nome: 'Ovo', preco: 3 }] };
const SABOR_SUCO = { nome: 'Sabor', tipo: 'um', escolhas: [{ nome: 'Laranja', preco: 0 }, { nome: 'Limão', preco: 0 }, { nome: 'Maracujá', preco: 0 }] };
const CATEGORIAS = ['Combos', 'Hambúrgueres', 'Porções', 'Bebidas', 'Sobremesas'];
const MOLHO = { nome: 'Molho', tipo: 'um', escolhas: [{ nome: 'Bolonhesa', preco: 0 }, { nome: 'Branco', preco: 0 }, { nome: 'Sugo', preco: 0 }, { nome: 'Quatro queijos', preco: 6 }] };
// [categoria, nome, descrição, preço, foto, destaque, selos, opções]
const U = id => 'https://images.unsplash.com/photo-' + id + '?w=800&q=80&auto=format&fit=crop';
const PRATOS = [
  ['Combos', 'Combo clássico', 'Hambúrguer à sua escolha + batata frita + bebida', 44, U('1594212699903-ec8a3eca50f5'), true, [], [{ nome: 'Escolha o hambúrguer', tipo: 'combo', categoria: 'Hambúrgueres', qtd: 1 }, { nome: 'Escolha a bebida', tipo: 'combo', categoria: 'Bebidas', qtd: 1 }]],
  ['Combos', 'Combo casal', '2 hambúrgueres à sua escolha + batata grande + 2 bebidas', 82, U('1550547660-d9450f859349'), false, [], [{ nome: 'Escolha os 2 hambúrgueres', tipo: 'combo', categoria: 'Hambúrgueres', qtd: 2 }, { nome: 'Escolha as 2 bebidas', tipo: 'combo', categoria: 'Bebidas', qtd: 2 }]],
  ['Porções', 'Batata frita', 'Porção de 300 g, crocante e sequinha', 19, U('1573080496219-bb080dd4f877'), false, ['vegano'], [{ nome: 'Tamanho', tipo: 'um', escolhas: [{ nome: 'Média (300 g)', preco: 0 }, { nome: 'Grande (500 g)', preco: 9 }] }, { nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Cheddar e bacon', preco: 8 }] }]],
  ['Porções', 'Nuggets de frango', '10 unidades com molho barbecue', 22, U('1562967914-608f82629710'), false, [], []],
  ['Hambúrgueres', 'Hambúrguer duplo', 'Dois blends de 150 g, cheddar, bacon e cebola caramelizada', 39, 'burger', true, [], [PONTO, ADIC_BURGER]],
  ['Hambúrgueres', 'Cheeseburger clássico', 'Blend de 160 g, queijo prato, alface e tomate', 29, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80&auto=format&fit=crop', false, [], [PONTO, ADIC_BURGER]],
  ['Hambúrgueres', 'Burger de frango crocante', 'Filé empanado, maionese de ervas e alface americana', 31, 'https://images.unsplash.com/photo-1637710847214-f91d99669e18?w=800&q=80&auto=format&fit=crop', false, [], [ADIC_BURGER]],
  ['Hambúrgueres', 'Smash burger duplo', 'Dois smash de 90 g, queijo americano e molho da casa no pão brioche', 34, 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=800&q=80&auto=format&fit=crop', false, [], [PONTO, ADIC_BURGER]],
  ['Hambúrgueres', 'Burger picles e cebola', 'Blend de 160 g, cheddar, picles e cebola crispy', 33, 'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=800&q=80&auto=format&fit=crop', false, [], [PONTO, ADIC_BURGER]],
  ['Hambúrgueres', 'Burger vegetariano', 'Hambúrguer de grão-de-bico, queijo e tomate assado', 30, 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=800&q=80&auto=format&fit=crop', false, ['vegetariano'], []],
  ['Sobremesas', 'Casquinha de chocolate', 'Sorvete artesanal de chocolate belga na casquinha crocante', 16, 'sorvete', true, ['vegetariano'], []],
  ['Sobremesas', 'Brownie com sorvete', 'Brownie quente com bola de creme', 22, 'https://images.unsplash.com/photo-1606884285898-277317a7bf12?w=800&q=80&auto=format&fit=crop', false, ['vegetariano'], []],
  ['Sobremesas', 'Pudim de leite', 'Receita da vó, com calda de caramelo', 14, 'https://images.unsplash.com/photo-1780798465831-de1e4d58ee46?w=800&q=80&auto=format&fit=crop', false, ['vegetariano', 'sem glúten'], []],
  ['Sobremesas', 'Açaí na tigela 500 ml', 'Com banana, morango e granola', 24, 'https://images.unsplash.com/photo-1627308594190-a057cd4bfac8?w=800&q=80&auto=format&fit=crop', false, ['vegano'], []],
  ['Bebidas', 'Milkshake de morango', '400 ml, com chantilly', 18, 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=800&q=80&auto=format&fit=crop', false, ['vegetariano'], []],
  ['Bebidas', 'Limonada suíça', '500 ml, batida com leite condensado', 11, 'https://images.unsplash.com/photo-1623084921164-4a8c5c37a912?w=800&q=80&auto=format&fit=crop', false, ['vegetariano'], []],
  ['Bebidas', 'Água mineral 500 ml', 'Com ou sem gás', 5, 'agua', false, ['vegano'], []],
  ['Bebidas', 'Suco natural 500 ml', 'Feito na hora', 12, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=80&auto=format&fit=crop', false, ['vegano'], [SABOR_SUCO]],
  ['Bebidas', 'Refrigerante lata', '350 ml', 7, 'https://images.unsplash.com/photo-1629654613528-5d0a2e4166de?w=800&q=80&auto=format&fit=crop', false, ['vegano'], []],
  ['Bebidas', 'Chá gelado da casa', '500 ml, com limão e hortelã', 9, 'https://images.unsplash.com/photo-1758705206938-a196ac3ae3bb?w=800&q=80&auto=format&fit=crop', false, ['vegano'], []]
];

// "Peça também": o que o restaurante sugere no carrinho
const SUGERIR = ['Batata frita', 'Refrigerante lata', 'Brownie com sorvete', 'Suco natural 500 ml', 'Casquinha de chocolate', 'Milkshake de morango'];
// Estoque de exemplo: [nome, unidade, estoque, mínimo, custo por unidade]
const INSUMOS = [
  ['Pão de hambúrguer', 'un', 80, 15, 1.4], ['Pão brioche', 'un', 40, 10, 2.2], ['Blend bovino 150 g', 'un', 70, 15, 6.2], ['Smash 90 g', 'un', 60, 12, 3.6],
  ['Queijo cheddar', 'kg', 3, 0.5, 52], ['Bacon', 'kg', 0.6, 0.8, 45], ['Frango', 'kg', 10, 2, 22], ['Hambúrguer de grão-de-bico', 'un', 20, 5, 3.8],
  ['Refrigerante lata', 'un', 96, 24, 3.1], ['Água mineral', 'un', 60, 12, 1.2], ['Laranja', 'kg', 15, 3, 4.5], ['Limão', 'kg', 6, 1, 6],
  ['Leite', 'l', 12, 3, 5.2], ['Morango', 'kg', 3, 0.5, 18], ['Sorvete de creme', 'l', 6, 1.5, 22], ['Chocolate', 'kg', 2, 0.5, 48],
  ['Açaí', 'kg', 5, 1, 24], ['Leite condensado', 'un', 0, 4, 7.9], ['Batata congelada', 'kg', 20, 5, 14], ['Nuggets', 'un', 200, 40, 0.7]
];
// Ficha técnica: prato -> [[insumo, quantidade por unidade vendida]]
const FICHAS = {
  'Hambúrguer duplo': [['Pão de hambúrguer', 1], ['Blend bovino 150 g', 2], ['Queijo cheddar', 0.04], ['Bacon', 0.04]],
  'Cheeseburger clássico': [['Pão de hambúrguer', 1], ['Blend bovino 150 g', 1], ['Queijo cheddar', 0.03]],
  'Smash burger duplo': [['Pão brioche', 1], ['Smash 90 g', 2], ['Queijo cheddar', 0.03]],
  'Burger picles e cebola': [['Pão de hambúrguer', 1], ['Blend bovino 150 g', 1], ['Queijo cheddar', 0.03]],
  'Burger de frango crocante': [['Pão de hambúrguer', 1], ['Frango', 0.15]],
  'Burger vegetariano': [['Pão de hambúrguer', 1], ['Hambúrguer de grão-de-bico', 1]],
  'Refrigerante lata': [['Refrigerante lata', 1]], 'Água mineral 500 ml': [['Água mineral', 1]],
  'Suco natural 500 ml': [['Laranja', 0.6]], 'Limonada suíça': [['Limão', 0.15], ['Leite', 0.1]],
  'Milkshake de morango': [['Leite', 0.25], ['Sorvete de creme', 0.15], ['Morango', 0.08]],
  'Casquinha de chocolate': [['Sorvete de creme', 0.12], ['Chocolate', 0.01]],
  'Brownie com sorvete': [['Chocolate', 0.06], ['Sorvete de creme', 0.1]], 'Pudim de leite': [['Leite condensado', 0.25]],
  'Açaí na tigela 500 ml': [['Açaí', 0.4], ['Morango', 0.05]],
  'Batata frita': [['Batata congelada', 0.3]], 'Nuggets de frango': [['Nuggets', 10]]
};
const AVALIACOES = [
  ['Juliana Rocha', 5, 'Chegou quentinho e muito bem embalado. Peço de novo com certeza!'],
  ['Marcos Teixeira', 5, 'O hambúrguer duplo é o melhor da cidade. Suculento e bem servido.'],
  ['Patrícia Lima', 4, 'Hambúrguer suculento e porção generosa. Só demorou um pouquinho.'],
  ['Rafael Souza', 5, 'Atendimento rápido e comida caprichada. Virou o nosso preferido.'],
  ['Camila Nunes', 5, 'O combo clássico vale muito a pena. Batata sequinha e lanche no ponto.'],
  ['Thiago Alves', 4, 'O milkshake de morango é ótimo. Preço justo e qualidade excelente.']
];

/* ======================= Gelato & Cia (sorveteria) ======================= */
const SABORES = ['Chocolate', 'Morango', 'Creme', 'Flocos', 'Doce de leite', 'Limão', 'Coco', 'Pistache'];
const bola = n => ({ nome: n, tipo: 'um', escolhas: SABORES.map(s => ({ nome: s, preco: s === 'Pistache' ? 3 : 0 })) });
const COBERTURA = { nome: 'Cobertura', tipo: 'um', escolhas: [{ nome: 'Sem cobertura', preco: 0 }, { nome: 'Chocolate', preco: 0 }, { nome: 'Caramelo', preco: 0 }, { nome: 'Morango', preco: 0 }] };
const EXTRAS_SORV = { nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Chantilly', preco: 3 }, { nome: 'Granulado', preco: 2 }, { nome: 'Castanha', preco: 4 }, { nome: 'Casquinha extra', preco: 2 }] };
const TAM_ACAI = { nome: 'Tamanho', tipo: 'um', escolhas: [{ nome: '300 ml', preco: 0 }, { nome: '500 ml', preco: 7 }, { nome: '700 ml', preco: 13 }] };
const ADIC_ACAI = { nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Banana', preco: 2 }, { nome: 'Morango', preco: 3 }, { nome: 'Granola', preco: 2 }, { nome: 'Leite em pó', preco: 2 }, { nome: 'Leite condensado', preco: 2 }, { nome: 'Paçoca', preco: 2 }, { nome: 'Creme de avelã', preco: 5 }] };
const TAM_SHAKE = { nome: 'Tamanho', tipo: 'um', escolhas: [{ nome: '400 ml', preco: 0 }, { nome: '500 ml', preco: 5 }] };
const SABOR_PICOLE = { nome: 'Sabor', tipo: 'um', escolhas: ['Limão', 'Morango', 'Uva', 'Abacaxi', 'Coco'].map(n => ({ nome: n, preco: 0 })) };
const GELATO = {
  slug: 'gelato-e-cia', tipo: 'sorveteria', senha: 'gelatoecia123', nomeDono: 'Fernanda', mesas: 0,
  emails: { dono: 'dono@gelatoecia.com', cozinha: 'balcao@gelatoecia.com', entregadores: [['Dudu', 'dudu@gelatoecia.com']] }, nomeCozinha: 'Balcão',
  nome: 'Gelato & Cia',
  extras: { frase: 'Sorvetes artesanais, açaí e milkshakes', sobre: 'Sorveteria artesanal: sorvetes feitos na casa todos os dias, açaí cremoso com adicionais e milkshakes batidos na hora.',
    capaUrl: U('1497034825429-c343d7c6a68f'), cor: '#E8508A', abre: '12:00', fecha: '22:30', aceitarForaDoHorario: true, taxaServico: 0, chavePix: 'pix@gelatoecia.com', whatsapp: '(15) 99999-1111',
    categorias: ['Sorvetes', 'Açaí', 'Milkshakes', 'Picolés', 'Bebidas'],
    delivery: { ativo: true, tempo: '25–35 min', tempoRetirada: '5–10 min', pedidoMinimo: 20, gratisAcimaDe: 60,
      bairros: [{ nome: 'Centro', taxa: 5 }, { nome: 'Jardim América', taxa: 7 }, { nome: 'Vila Nova', taxa: 8 }], modo: 'bairro',
      local: { lat: -23.4985, lng: -47.4522, endereco: 'Centro, Sorocaba - SP (endereço de exemplo)' }, faixas: [{ ate: 3, taxa: 5 }, { ate: 6, taxa: 8 }] },
    agendamento: { ativo: false, antecedencia: 60, dias: 1, preparo: 15 } },
  pratos: [
    ['Sorvetes', 'Casquinha 1 bola', 'Uma bola do sabor que você escolher na casquinha crocante', 12, U('1501443762994-82bd5dace89a'), false, ['vegetariano'], [bola('Sabor')]],
    ['Sorvetes', 'Copo 2 bolas', 'Duas bolas com cobertura à sua escolha', 18, U('1563805042-7684c019e1cb'), true, ['vegetariano'], [bola('1ª bola'), bola('2ª bola'), COBERTURA]],
    ['Sorvetes', 'Taça 3 bolas', 'Três bolas, cobertura e adicionais', 26, U('1570197788417-0e82375c9371'), false, ['vegetariano'], [bola('1ª bola'), bola('2ª bola'), bola('3ª bola'), COBERTURA, EXTRAS_SORV]],
    ['Sorvetes', 'Sundae de chocolate', 'Creme, calda quente de chocolate, chantilly e castanha', 22, U('1488900128323-21503983a07e'), false, ['vegetariano'], []],
    ['Sorvetes', 'Casquinha de chocolate', 'Sorvete de chocolate belga na casquinha', 13, F('sorvete'), false, ['vegetariano'], []],
    ['Açaí', 'Açaí no copo', 'Açaí cremoso batido na hora. Escolha o tamanho e os adicionais', 18, U('1590301157890-4810ed352733'), true, ['vegano'], [TAM_ACAI, ADIC_ACAI]],
    ['Açaí', 'Açaí na tigela', 'Tigela de 500 ml com banana, morango e granola', 27, U('1627308594190-a057cd4bfac8'), false, ['vegano'], [ADIC_ACAI]],
    ['Açaí', 'Bowl de frutas', 'Açaí com frutas da estação e mel', 29, U('1511690743698-d9d85f2fbf38'), false, ['vegetariano'], []],
    ['Milkshakes', 'Milkshake de morango', 'Com sorvete de creme, morango e chantilly', 19, U('1579954115545-a95591f28bfc'), false, ['vegetariano'], [TAM_SHAKE]],
    ['Milkshakes', 'Milkshake de chocolate', 'Com sorvete de chocolate e calda', 19, U('1572490122747-3968b75cc699'), false, ['vegetariano'], [TAM_SHAKE]],
    ['Picolés', 'Picolé de fruta', 'Feito com fruta de verdade', 6, U('1505394033641-40c6ad1178d7'), false, ['vegano'], [SABOR_PICOLE]],
    ['Picolés', 'Picolé cremoso', 'Chocolate, morango ou coco, cobertos com chocolate', 9, U('1557142046-c704a3adf364'), false, ['vegetariano'], [{ nome: 'Sabor', tipo: 'um', escolhas: [{ nome: 'Chocolate', preco: 0 }, { nome: 'Morango', preco: 0 }, { nome: 'Coco', preco: 0 }] }]],
    ['Bebidas', 'Água mineral 500 ml', 'Com ou sem gás', 5, F('agua'), false, ['vegano'], []],
    ['Bebidas', 'Refrigerante lata', '350 ml', 7, U('1629654613528-5d0a2e4166de'), false, ['vegano'], []],
    ['Bebidas', 'Café expresso', 'Para acompanhar o sorvete', 6, U('1495474472287-4d71bcdd2085'), false, ['vegano'], []]
  ],
  sugerir: ['Casquinha 1 bola', 'Picolé de fruta', 'Água mineral 500 ml'],
  insumos: [['Sorvete artesanal', 'l', 40, 8, 18], ['Casquinha', 'un', 300, 50, 0.35], ['Copo 300 ml', 'un', 400, 80, 0.3], ['Açaí', 'kg', 25, 5, 22], ['Granola', 'kg', 4, 1, 18],
    ['Morango', 'kg', 4, 1, 18], ['Banana', 'kg', 6, 1, 6], ['Leite', 'l', 15, 3, 5.2], ['Calda de chocolate', 'kg', 3, 0.5, 30], ['Picolé de fruta', 'un', 120, 30, 1.8], ['Picolé cremoso', 'un', 80, 20, 2.6],
    ['Refrigerante lata', 'un', 48, 12, 3.1], ['Água mineral', 'un', 48, 12, 1.2], ['Café em grãos', 'kg', 2, 0.5, 60]],
  fichas: {
    'Casquinha 1 bola': [['Sorvete artesanal', 0.08], ['Casquinha', 1]], 'Copo 2 bolas': [['Sorvete artesanal', 0.16], ['Copo 300 ml', 1]],
    'Taça 3 bolas': [['Sorvete artesanal', 0.24]], 'Sundae de chocolate': [['Sorvete artesanal', 0.15], ['Calda de chocolate', 0.04]],
    'Casquinha de chocolate': [['Sorvete artesanal', 0.1], ['Casquinha', 1]], 'Açaí no copo': [['Açaí', 0.3], ['Copo 300 ml', 1]],
    'Açaí na tigela': [['Açaí', 0.45], ['Banana', 0.08], ['Morango', 0.05], ['Granola', 0.03]], 'Bowl de frutas': [['Açaí', 0.35], ['Morango', 0.06], ['Banana', 0.08]],
    'Milkshake de morango': [['Leite', 0.2], ['Sorvete artesanal', 0.15], ['Morango', 0.06]], 'Milkshake de chocolate': [['Leite', 0.2], ['Sorvete artesanal', 0.15], ['Calda de chocolate', 0.03]],
    'Picolé de fruta': [['Picolé de fruta', 1]], 'Picolé cremoso': [['Picolé cremoso', 1]], 'Refrigerante lata': [['Refrigerante lata', 1]], 'Água mineral 500 ml': [['Água mineral', 1]], 'Café expresso': [['Café em grãos', 0.008]]
  },
  avaliacoes: [
    ['Larissa Campos', 5, 'O açaí é muito cremoso e os adicionais são generosos. Amei!'],
    ['Pedro Henrique', 5, 'Sorvete de pistache maravilhoso. Chegou firme, bem embalado.'],
    ['Aline Martins', 4, 'Milkshake delicioso. Só achei que podia vir um pouco mais gelado.'],
    ['Gustavo Reis', 5, 'Pedi no totem da loja, foi rapidinho e sem fila.'],
    ['Bianca Moraes', 5, 'Melhor sorveteria do bairro. As crianças adoram a taça de 3 bolas.']
  ],
  historico: { mix: { mesa: 0, delivery: 0.4 }, horas: rnd => rnd() < 0.6 ? 13 + Math.floor(rnd() * 5) : 18 + Math.floor(rnd() * 4.5), dia: [26, 12, 15, 16, 18, 30, 34], semente: 20261012 }
};

/* ======================= Cantina Bella (restaurante) ======================= */
const MASSA = { nome: 'Massa', tipo: 'um', escolhas: [{ nome: 'Espaguete', preco: 0 }, { nome: 'Penne', preco: 0 }, { nome: 'Fettuccine', preco: 0 }, { nome: 'Nhoque', preco: 4 }] };
const ACOMP = { nome: 'Acompanhamento', tipo: 'um', escolhas: [{ nome: 'Arroz e batatas', preco: 0 }, { nome: 'Legumes grelhados', preco: 0 }, { nome: 'Purê de batata', preco: 0 }, { nome: 'Espaguete ao sugo', preco: 6 }] };
const BELLA = {
  slug: 'cantina-bella', tipo: 'restaurante', senha: 'cantinabella123', nomeDono: 'Sr. Antônio', mesas: 15,
  emails: { dono: 'dono@cantinabella.com', cozinha: 'cozinha@cantinabella.com', entregadores: [['Léo', 'leo@cantinabella.com']] }, nomeCozinha: 'Cozinha',
  nome: 'Cantina Bella',
  extras: { frase: 'Cozinha italiana, massas frescas e vinhos', sobre: 'Cantina de família: massas frescas feitas na casa, molhos de longo cozimento, carnes na brasa e uma carta de vinhos para acompanhar.',
    capaUrl: U('1517248135467-4c7edcad34c4'), cor: '#8C2F39', abre: '11:30', fecha: '23:00', aceitarForaDoHorario: true, taxaServico: 10, chavePix: 'pix@cantinabella.com', whatsapp: '(15) 99999-2222',
    categorias: ['Entradas', 'Massas', 'Pratos principais', 'Vinhos', 'Bebidas', 'Sobremesas'],
    delivery: { ativo: true, tempo: '45–60 min', tempoRetirada: '25–35 min', pedidoMinimo: 50, gratisAcimaDe: 180,
      bairros: [{ nome: 'Centro', taxa: 8 }, { nome: 'Campolim', taxa: 10 }, { nome: 'Jardim América', taxa: 12 }], modo: 'bairro',
      local: { lat: -23.5102, lng: -47.4657, endereco: 'Campolim, Sorocaba - SP (endereço de exemplo)' }, faixas: [{ ate: 4, taxa: 8 }, { ate: 8, taxa: 12 }] },
    agendamento: { ativo: true, antecedencia: 90, dias: 3, preparo: 50 } },
  pratos: [
    ['Entradas', 'Bruschetta de tomate', 'Pão italiano tostado, tomate, manjericão e azeite (4 unidades)', 28, U('1572695157366-5e585ab2b69f'), false, ['vegano'], []],
    ['Entradas', 'Salada da casa', 'Folhas, tomate-cereja, queijo de búfala e molho de mostarda e mel', 34, U('1512621776951-a57141f2eefd'), false, ['vegetariano', 'sem glúten'], []],
    ['Entradas', 'Sopa do dia', 'Pergunte ao garçom o sabor de hoje', 24, F('sopa'), false, ['vegetariano'], []],
    ['Massas', 'Espaguete ao sugo', 'Molho de tomate italiano de cozimento lento e manjericão', 46, U('1551183053-bf91a1d81141'), false, ['vegano'], []],
    ['Massas', 'Fettuccine à carbonara', 'Bacon, gema, queijo pecorino e pimenta-do-reino', 58, U('1621996346565-e3dbc646d9a9'), true, [], []],
    ['Massas', 'Lasanha à bolonhesa', 'Massa fresca, molho bolonhesa, bechamel e muçarela gratinada', 62, U('1574894709920-11b28e7367e3'), true, [], []],
    ['Massas', 'Massa do seu jeito', 'Escolha a massa e o molho', 49, U('1473093295043-cdd812d0e601'), false, ['vegetariano'], [MASSA, MOLHO]],
    ['Pratos principais', 'Filé ao molho madeira', 'Medalhão de 220 g com molho madeira e cogumelos', 79, U('1600891964092-4316c288032e'), true, ['sem glúten'], [PONTO, ACOMP]],
    ['Pratos principais', 'Risoto de cogumelos', 'Arbóreo, mix de cogumelos, parmesão e manteiga', 64, U('1476124369491-e7addf5db371'), false, ['vegetariano', 'sem glúten'], []],
    ['Pratos principais', 'Salmão grelhado', 'Posta de 200 g com ervas e limão siciliano', 84, U('1467003909585-2f8a72700288'), false, ['sem glúten'], [ACOMP]],
    ['Vinhos', 'Taça de vinho tinto', 'Tinto seco da casa, 150 ml', 26, U('1510812431401-41d2bd2722f3'), false, ['vegano'], []],
    ['Vinhos', 'Garrafa de vinho tinto', 'Cabernet Sauvignon chileno, 750 ml', 129, U('1553361371-9b22f78e8b1d'), false, ['vegano'], []],
    ['Bebidas', 'Água mineral 500 ml', 'Com ou sem gás', 6, F('agua'), false, ['vegano'], []],
    ['Bebidas', 'Refrigerante lata', '350 ml', 8, U('1629654613528-5d0a2e4166de'), false, ['vegano'], []],
    ['Bebidas', 'Suco natural 500 ml', 'Feito na hora', 13, U('1600271886742-f049cd451bba'), false, ['vegano'], [SABOR_SUCO]],
    ['Bebidas', 'Limonada siciliana', '500 ml, com hortelã', 14, U('1556679343-c7306c1976bc'), false, ['vegano'], []],
    ['Sobremesas', 'Tiramisù', 'Receita tradicional, com café e mascarpone', 29, U('1571877227200-a0d98ea607e9'), true, ['vegetariano'], []],
    ['Sobremesas', 'Pudim de leite', 'Com calda de caramelo', 18, U('1780798465831-de1e4d58ee46'), false, ['vegetariano', 'sem glúten'], []],
    ['Sobremesas', 'Café expresso', 'Para fechar a refeição', 7, U('1495474472287-4d71bcdd2085'), false, ['vegano'], []]
  ],
  sugerir: ['Bruschetta de tomate', 'Taça de vinho tinto', 'Tiramisù', 'Café expresso'],
  insumos: [['Massa fresca', 'kg', 15, 3, 18], ['Molho de tomate', 'l', 12, 3, 9], ['Carne moída', 'kg', 6, 1.5, 38], ['Bacon', 'kg', 2, 0.5, 45], ['Filé mignon', 'kg', 8, 2, 89],
    ['Salmão', 'kg', 4, 1, 95], ['Arroz arbóreo', 'kg', 5, 1, 32], ['Cogumelos', 'kg', 2, 0.5, 48], ['Queijo parmesão', 'kg', 2, 0.5, 90], ['Muçarela', 'kg', 4, 1, 42],
    ['Vinho tinto (garrafa)', 'un', 24, 6, 55], ['Refrigerante lata', 'un', 48, 12, 3.1], ['Água mineral', 'un', 48, 12, 1.2], ['Laranja', 'kg', 10, 2, 4.5], ['Limão siciliano', 'kg', 3, 0.5, 14],
    ['Mascarpone', 'kg', 1.5, 0.5, 78], ['Leite condensado', 'un', 10, 3, 7.9], ['Café em grãos', 'kg', 2, 0.5, 60]],
  fichas: {
    'Espaguete ao sugo': [['Massa fresca', 0.2], ['Molho de tomate', 0.15]], 'Fettuccine à carbonara': [['Massa fresca', 0.2], ['Bacon', 0.06], ['Queijo parmesão', 0.03]],
    'Lasanha à bolonhesa': [['Massa fresca', 0.15], ['Carne moída', 0.15], ['Molho de tomate', 0.12], ['Muçarela', 0.08]], 'Massa do seu jeito': [['Massa fresca', 0.2], ['Molho de tomate', 0.12]],
    'Filé ao molho madeira': [['Filé mignon', 0.22], ['Cogumelos', 0.04]], 'Risoto de cogumelos': [['Arroz arbóreo', 0.12], ['Cogumelos', 0.1], ['Queijo parmesão', 0.03]],
    'Salmão grelhado': [['Salmão', 0.2], ['Limão siciliano', 0.03]], 'Taça de vinho tinto': [['Vinho tinto (garrafa)', 0.2]], 'Garrafa de vinho tinto': [['Vinho tinto (garrafa)', 1]],
    'Refrigerante lata': [['Refrigerante lata', 1]], 'Água mineral 500 ml': [['Água mineral', 1]], 'Suco natural 500 ml': [['Laranja', 0.6]], 'Limonada siciliana': [['Limão siciliano', 0.12]],
    'Tiramisù': [['Mascarpone', 0.08], ['Café em grãos', 0.005]], 'Pudim de leite': [['Leite condensado', 0.25]], 'Café expresso': [['Café em grãos', 0.008]], 'Bruschetta de tomate': [['Molho de tomate', 0.03]]
  },
  avaliacoes: [
    ['Renata Siqueira', 5, 'A lasanha é igual à da nonna. Ambiente acolhedor e atendimento impecável.'],
    ['Eduardo Prado', 5, 'Pedimos pelo QR da mesa e chamamos o garçom pelo celular. Muito prático!'],
    ['Cláudia Ferraz', 4, 'Carbonara deliciosa. Na sexta à noite demorou um pouco, mas valeu.'],
    ['Ricardo Lopes', 5, 'Filé no ponto certinho e o tiramisù é obrigatório.'],
    ['Mônica Albuquerque', 5, 'Ótima carta de vinhos e preço justo. Voltaremos.']
  ],
  historico: { mix: { mesa: 0.68, delivery: 0.22 }, horas: rnd => rnd() < 0.5 ? 11 + Math.floor(rnd() * 3.5) : 19 + Math.floor(rnd() * 4), dia: [24, 12, 14, 15, 18, 28, 32], semente: 20261013,
    pesoMesa: [1.2, 1.5, 0.8, 2.0, 1.0, 0.6, 1.4, 0.9, 0.5, 1.1, 0.7, 1.3, 1.0, 0.6, 0.9] }
};

/* ======================= Sabor da Casa (lanchonete) ======================= */
const SABOR = {
  slug: SLUG, tipo: 'lanchonete', senha: SENHA, nomeDono: 'Dona Lúcia', mesas: 12,
  emails: { dono: EMAILS.dono, cozinha: EMAILS.cozinha, entregadores: [['Carlos', EMAILS.carlos], ['Rafa', EMAILS.rafa]] }, nomeCozinha: 'Cozinha',
  nome: 'Sabor da Casa',
  extras: { frase: 'Hambúrgueres artesanais, combos e milkshakes', sobre: 'Hamburgueria de bairro: blends grelhados na hora, pão brioche, combos, porções e sobremesas para fechar com chave de ouro.',
    capaUrl: F('burger'), cor: '#E30613', abre: '11:00', fecha: '23:30', aceitarForaDoHorario: true, taxaServico: 10, chavePix: 'pix@sabordacasa.com', whatsapp: '(15) 99999-0000',
    categorias: CATEGORIAS,
    delivery: { ativo: true, tempo: '35–45 min', tempoRetirada: '20–30 min', pedidoMinimo: 30, gratisAcimaDe: 100,
      bairros: [{ nome: 'Centro', taxa: 6 }, { nome: 'Jardim América', taxa: 8 }, { nome: 'Vila Nova', taxa: 10 }, { nome: 'Campolim', taxa: 12 }],
      // já deixa a taxa por distância pronta: basta trocar o modo nas configurações do painel
      modo: 'bairro', local: { lat: -23.5016, lng: -47.4581, endereco: 'Centro, Sorocaba - SP (endereço de exemplo)' },
      faixas: [{ ate: 3, taxa: 6 }, { ate: 5, taxa: 8 }, { ate: 8, taxa: 11 }, { ate: 12, taxa: 15 }] },
    agendamento: { ativo: true, antecedencia: 60, dias: 2, preparo: 45 },
    fiscal: { cnpj: '', ie: '', razao: 'Sabor da Casa Restaurante LTDA (exemplo)', regime: '1', ambiente: 'homologacao', auto: false, ncm: '21069090', cfop: '5102', csosn: '102' } },
  // a lanchonete de exemplo também tem mesas, para mostrar o QR Code da mesa e o mapa das mesas
  funcoesExtras: ['mesa', 'chamados', 'nfce'],
  pratos: PRATOS, sugerir: SUGERIR, insumos: INSUMOS, fichas: FICHAS, avaliacoes: AVALIACOES,
  historico: { mix: { mesa: 0.45, delivery: 0.4 }, horas: rnd => rnd() < 0.45 ? 11 + Math.floor(rnd() * 3.5) : 18 + Math.floor(rnd() * 4.8), dia: [27, 14, 20, 20, 20, 31, 31], semente: 20261005,
    pesoMesa: [1.6, 1.2, 0.8, 2.0, 1.0, 0.55, 1.4, 0.9, 0.45, 1.1, 0.7, 1.3] }
};
const DEMOS = [SABOR, GELATO, BELLA];
// Exemplos de versões anteriores, apagados quando o novo é criado
const SLUGS = DEMOS.map(d => d.slug);

const composto = p => (p.opcoes || []).some(o => o.tipo === 'combo' || o.tipo === 'sabores');

async function criarEstoque(c, rest, produtos, d) {
  const ids = {};
  for (const [nome, unidade, est, min, custo] of d.insumos)
    ids[nome] = (await c.query('INSERT INTO insumos (restaurante_id, nome, unidade, estoque, minimo, custo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [rest.id, nome, unidade, est, min, custo])).rows[0].id;
  for (const p of produtos) for (const [ins, q] of (d.fichas[p.nome] || []))
    await c.query('INSERT INTO ficha_tecnica (restaurante_id, produto_id, insumo_id, qtd) VALUES ($1,$2,$3,$4)', [rest.id, p.id, ids[ins], q]);
}

// Pedidos de exemplo dos últimos 30 dias, para demonstrar relatórios e o mapa das mesas
async function gerarHistorico(c, rest, produtos, d) {
  const H = d.historico;
  let semente = H.semente;
  const rnd = () => { semente = semente + 0x6D2B79F5 | 0; let t = Math.imul(semente ^ semente >>> 15, 1 | semente); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const pesoMesa = H.pesoMesa || [1], soma = pesoMesa.reduce((a, b) => a + b, 0);
  const mesa = () => { let r = rnd() * soma; for (let k = 0; k < pesoMesa.length; k++){ r -= pesoMesa[k]; if (r <= 0) return k + 1; } return pesoMesa.length; };
  const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Karen', 'Lucas', 'Marina', 'Nando', 'Olívia', 'Paulo'];
  const ruas = ['Rua das Flores', 'Av. São Paulo', 'Rua Sete de Setembro', 'Rua Padre Luiz', 'Av. Brasil'];
  const ents = (await c.query("SELECT id, nome FROM usuarios WHERE restaurante_id = $1 AND papel = 'entregador'", [rest.id])).rows;
  const disp = produtos.filter(p => !p.esgotado && !composto(p)), bairros = rest.delivery.bairros;
  const cent = v => Math.round(v * 100) / 100;
  const agora = Date.now(), hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  let n = 0, num = 0; const porDia = new Map(), diaDe = t => new Intl.DateTimeFormat('en-CA', { timeZone: rest.fuso }).format(new Date(t));
  for (let dd = 30; dd >= 0; dd--) {
    const dia = hoje0.getTime() - dd * 86400000, dow = new Date(dia).getDay();
    const qtd = Math.round(H.dia[dow] * (0.85 + rnd() * 0.3));
    for (let k = 0; k < qtd; k++) {
      const ts = dia + H.horas(rnd) * 3600000 + Math.floor(rnd() * 60) * 60000;
      if (ts > agora - 15 * 60000) continue;
      const r = rnd(), tipo = r < H.mix.mesa ? 'mesa' : r < H.mix.mesa + H.mix.delivery ? 'delivery' : 'retirada';
      const usados = new Set(), itens = [];
      for (let j = 0, nl = 1 + Math.floor(rnd() * 3); j < nl; j++) {
        const p = pick(disp); if (usados.has(p.id)) continue; usados.add(p.id);
        const ops = p.opcoes.filter(o => o.tipo === 'um').map(o => o.escolhas[Math.floor(rnd() * Math.min(3, o.escolhas.length))].nome);
        itens.push({ p, qtd: 1 + (rnd() < 0.35 ? 1 : 0) + (tipo === 'mesa' && rnd() < 0.2 ? 1 : 0), ops });
      }
      const sub = cent(itens.reduce((a, i) => a + i.p.preco * i.qtd, 0));
      const serv = tipo === 'mesa' ? cent(sub * rest.taxaServico / 100) : 0;
      const b = pick(bairros), ent = tipo === 'delivery' ? (rest.delivery.gratisAcimaDe && sub >= rest.delivery.gratisAcimaDe ? 0 : b.taxa) : 0;
      const pag = tipo === 'delivery' ? pick(['pix', 'pix', 'cartao', 'cartao', 'dinheiro']) : pick(['pix', 'local', 'local']);
      const e = tipo === 'delivery' && ents.length ? pick(ents) : null;
      const diaL = diaDe(ts); num = (porDia.get(diaL) || 0) + 1; porDia.set(diaL, num); // número do dia: 001, 002…
      const pd = (await c.query(`INSERT INTO pedidos (restaurante_id, numero, tipo, mesa, cliente_nome, cliente_tel, entrega_endereco, entrega_bairro, subtotal, servico, taxa_entrega, total, pag_metodo, pag_pago, status, entregador_id, entregador_nome, codigo_acomp, criado_em, atualizado_em, dia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'entregue',$14,$15,$16,$17,$17,$18) RETURNING id`,
        [rest.id, num, tipo, tipo === 'mesa' ? mesa() : null, pick(nomes), tipo === 'mesa' ? '' : '(15) 99' + (100 + Math.floor(rnd() * 899)) + '-' + (1000 + Math.floor(rnd() * 8999)),
          tipo === 'delivery' ? pick(ruas) + ', ' + (10 + Math.floor(rnd() * 900)) : null, tipo === 'delivery' ? b.nome : null, sub, serv, ent, cent(sub + serv + ent), pag, e && e.id, e && e.nome, 'exemplo' + diaL + '-' + num, new Date(ts), diaL])).rows[0];
      const vals = [], ph = [];
      itens.forEach((i, x) => { vals.push(pd.id, rest.id, i.p.id, i.p.nome, i.qtd, i.p.preco, i.ops, x); const o = x * 8; ph.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`); });
      await c.query('INSERT INTO pedido_itens (pedido_id, restaurante_id, produto_id, nome, qtd, unit, opcoes, ordem) VALUES ' + ph.join(','), vals);
      await c.query("INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por, em) VALUES ($1,$2,'novo','cliente',$3), ($1,$2,'entregue','exemplo',$4)", [pd.id, rest.id, new Date(ts), new Date(ts + 35 * 60000)]);
      n++;
    }
  }
  // continua a numeração de hoje depois dos pedidos de exemplo
  await c.query(`UPDATE restaurantes SET seq_dia = (now() AT TIME ZONE fuso)::date,
    seq_pedido = coalesce((SELECT max(numero) FROM pedidos WHERE restaurante_id = $1 AND dia = (now() AT TIME ZONE restaurantes.fuso)::date), 0) WHERE id = $1`, [rest.id]);
  return n;
}

// Avaliações de exemplo em pedidos entregues (sem conta de cliente, como no uso real)
async function avaliar(c, rest, lista) {
  const ids = (await c.query("SELECT id FROM pedidos WHERE restaurante_id = $1 AND status = 'entregue' AND tipo IN ('delivery', 'retirada') ORDER BY criado_em DESC LIMIT $2", [rest.id, lista.length])).rows;
  for (let i = 0; i < ids.length; i++) {
    const [nome, nota, comentario] = lista[i];
    await c.query('UPDATE pedidos SET cliente_nome = $2 WHERE id = $1', [ids[i].id, nome]);
    await c.query('INSERT INTO avaliacoes (restaurante_id, pedido_id, nota, comentario, criado_em) SELECT restaurante_id, id, $2, $3, LEAST(criado_em + interval \'1 hour\', now() - interval \'1 minute\') FROM pedidos WHERE id = $1', [ids[i].id, nota, comentario]);
  }
  return ids.length;
}

const emailsDe = d => [d.emails.dono, d.emails.cozinha].concat(d.emails.entregadores.map(e => e[1]));

// Cria UMA demonstração. c = conexão em contexto de sistema.
async function criarUma(c, d, { historico }) {
  await c.query('DELETE FROM usuarios WHERE email = ANY($1)', [emailsDe(d)]);
  const { rest } = await criarRestaurante(c, { nome: d.nome, slug: d.slug, tipo: d.tipo, email: d.emails.dono, senha: d.senha, nomeDono: d.nomeDono, mesas: d.mesas, extras: d.extras });
  // totem já liberado (com link) e as funções a mais desta demonstração
  const extrasRec = (d.funcoesExtras || []).map(k => ', rec_' + k + ' = true').join('');
  await c.query('UPDATE restaurantes SET totem_token = $2' + extrasRec + ' WHERE id = $1', [rest.id, require('./util').tokenAleatorio(12)]);
  const hash = await bcrypt.hash(d.senha, 10);
  const equipe = [[d.nomeCozinha || 'Cozinha', d.emails.cozinha, 'cozinha']].concat(d.emails.entregadores.map(([nome, email]) => [nome, email, 'entregador']));
  for (const [nome, email, papel] of equipe)
    await c.query('INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1,$2,$3,$4,$5)', [rest.id, nome, email, papel, hash]);
  const criados = [];
  for (const [categoria, nome, descricao, preco, foto, destaque, selos, opcoes] of d.pratos)
    criados.push(await repo.criarProduto(c, rest.id, { categoria, nome, descricao, preco, selos, opcoes, fotoUrl: /^https?:\/\//.test(foto) || /^\//.test(foto) ? foto : (foto ? F(foto) : ''), esgotado: false, destaque }));
  await c.query('UPDATE produtos SET sugerir = true WHERE restaurante_id = $1 AND nome = ANY($2)', [rest.id, d.sugerir]);
  await criarEstoque(c, rest, criados, d);
  const r2 = await repo.carregarRest(c, rest.id);
  const nHist = historico ? await gerarHistorico(c, r2, criados, d) : 0;
  // custo dos itens vendidos pela ficha técnica, para o relatório de lucro por prato
  if (historico) await c.query(`UPDATE pedido_itens i SET custo = x.custo FROM (SELECT f.produto_id, sum(f.qtd * n.custo) AS custo FROM ficha_tecnica f JOIN insumos n ON n.id = f.insumo_id WHERE f.restaurante_id = $1 GROUP BY f.produto_id) x
    WHERE i.restaurante_id = $1 AND i.produto_id = x.produto_id`, [rest.id]);
  const nAv = historico ? await avaliar(c, r2, d.avaliacoes) : 0;
  return { rest: r2, nHist, nAv, demo: d };
}

// Cria as demonstrações que ainda não existem (com reset, apaga e recria as três).
// Devolve a lista das que foram criadas agora.
async function criarDemos(c, { reset = false, historico = false } = {}) {
  // remove os exemplos das versões anteriores (só os de demonstração, pelos e-mails de exemplo)
  await c.query("DELETE FROM restaurantes r WHERE r.slug = ANY($1) AND EXISTS (SELECT 1 FROM usuarios u WHERE u.restaurante_id = r.id AND (u.email LIKE '%.demo' OR u.email LIKE '%@casajabuticaba.com'))", [ANTIGOS]);
  const feitos = [];
  for (const d of DEMOS) {
    const ex = (await c.query('SELECT id FROM restaurantes WHERE slug = $1', [d.slug])).rows[0];
    if (ex && !reset) continue;
    if (ex) {
      // só apaga se for mesmo a demonstração (o dono é o e-mail de exemplo); um restaurante real com esse endereço fica intacto
      const ehDemo = (await c.query("SELECT 1 FROM usuarios WHERE restaurante_id = $1 AND email = $2 AND papel = 'dono'", [ex.id, d.emails.dono])).rowCount;
      if (!ehDemo) continue;
      await c.query('DELETE FROM restaurantes WHERE id = $1', [ex.id]); // apaga tudo dele em cascata
    }
    feitos.push(await criarUma(c, d, { historico }));
  }
  return feitos;
}
// compatibilidade: cria só o Sabor da Casa
async function criarDemo(c, op = {}) {
  const ex = (await c.query('SELECT id FROM restaurantes WHERE slug = $1', [SLUG])).rows[0];
  if (ex && !op.reset) return null;
  if (ex) await c.query('DELETE FROM restaurantes WHERE id = $1', [ex.id]);
  return criarUma(c, SABOR, { historico: !!op.historico });
}

module.exports = { criarDemos, criarDemo, DEMOS, SLUGS, SLUG, SENHA, EMAILS };
