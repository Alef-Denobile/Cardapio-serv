// Restaurantes de exemplo do ChefOnline (fotos do protótipo no Figma em /img/chef)
const bcrypt = require('bcryptjs');
const repo = require('./repo');
const { criarRestaurante } = require('./criarRestaurante');

const F = n => '/img/chef/' + n + '.jpg';
const BAIRROS = [{ nome: 'Centro', taxa: 6 }, { nome: 'Jardim América', taxa: 8 }, { nome: 'Vila Nova', taxa: 10 }, { nome: 'Campolim', taxa: 12 }];
const EXEMPLOS = [
  { slug: 'pizzaria-do-ze', nome: 'Pizzaria do Zé', cat: 'Pizza', cor: '#C0392B', capa: 'pepperoni', taxas: [10, 10, 12, 14], gratis: 80, tempo: '35–45 min',
    sobre: 'Convide família, amigos e colegas para conhecer a nossa variedade de pizzas, na massa de fermentação natural e forno a lenha.',
    pratos: [['Pizzas', 'Pizza 74,5 queijos', 'Queijo, queijo, queijo, queijo e muito queijo…', 30, 'queijos'], ['Pizzas', 'Pizza de azzip', 'Pizza boa, pizza ao contrário', 25, 'azzip'], ['Pizzas', 'Pizza Crocante', 'Massa fininha, tomate-cereja e alecrim', 49, 'pizza', true], ['Pizzas', 'Pizza de pepperoni', 'Pepperoni, mussarela e orégano', 52, 'pepperoni', true], ['Bebidas', 'Suco de água', 'Água, porém, melhor', 10, 'agua']] },
  { slug: 'mexican-gourmet', nome: 'Mexican Gourmet', cat: 'Mexicana', cor: '#D35400', capa: 'tacos', gratis: 0, tempo: '40–50 min',
    sobre: 'Tacos, burritos e guacamole feitos na hora, com tortilhas artesanais e pimentas da casa.',
    pratos: [['Pratos', 'Comida Mexicana', 'Tacos de camarão com abacate e molho chipotle', 60, 'tacos', true], ['Pratos', 'Burrito de carne', 'Carne desfiada, feijão, arroz e queijo', 42], ['Porções', 'Nachos com guacamole', 'Porção para dividir', 34]] },
  { slug: 'padaria-da-maria', nome: 'Padaria da Maria', cat: 'Café', cor: '#8E5B3A', capa: 'cafe', taxas: [5, 5, 7, 8], gratis: 40, tempo: '20–30 min',
    sobre: 'Pão quentinho o dia todo, cafés especiais e o café da manhã mais completo do bairro.',
    pratos: [['Café da manhã', 'Café Completo', 'Café coado, pão na chapa, ovos mexidos e frutas', 15, 'cafe', true], ['Bebidas', 'Cappuccino cremoso', 'Com canela e chocolate', 12, 'cafe'], ['Salgados', 'Pão de queijo (6 un.)', 'Assado na hora', 9]] },
  { slug: 'fitness-center', nome: 'Fitness Center', cat: 'Natural', cor: '#2E8C6A', capa: 'natural', gratis: 60, tempo: '25–35 min',
    sobre: 'Refeições equilibradas, ingredientes frescos e porções certas para quem treina.',
    pratos: [['Bowls', 'Comida Natural', 'Bowl de grãos, legumes assados e frango', 35, 'natural', true], ['Saladas', 'Salada da estação', 'Folhas, quinoa e molho de iogurte', 28], ['Bebidas', 'Suco verde', 'Couve, limão, gengibre e maçã', 14]] },
  { slug: 'hotsoup', nome: 'Restaurante HotSoup', cat: 'Sopas', cor: '#B7791F', capa: 'sopa', gratis: 0, tempo: '30–40 min',
    sobre: 'Sopas e caldos que abraçam: receitas de família feitas em panela grande, todos os dias.',
    pratos: [['Sopas', 'Sopa de abóbora', 'Com creme de leite e ervas frescas', 30, 'sopa', true], ['Sopas', 'Caldo verde', 'Couve, batata e linguiça', 26], ['Sopas', 'Canja da vó', 'Frango, arroz e legumes', 24]] },
  { slug: 'sorveteria-da-polar', nome: 'Sorveteria da Polar', cat: 'Sorvetes', cor: '#6C3483', capa: 'sorvete', gratis: 50, tempo: '20–30 min',
    sobre: 'Sorvetes artesanais de massa, casquinhas crocantes e caldas quentes.',
    pratos: [['Sorvetes', 'Sorvetes', 'Casquinha dupla de chocolate belga', 20, 'sorvete', true], ['Sorvetes', 'Sundae de caramelo', 'Com farofa de castanhas', 18], ['Potes', 'Pote 500 ml', 'Escolha até 3 sabores na observação', 32]] },
  { slug: 'burger-monstro', nome: 'Burger Monstro', cat: 'Hambúrguer', cor: '#A93226', capa: 'burger', gratis: 70, tempo: '30–40 min',
    sobre: 'Hambúrgueres de verdade: blend da casa, pão brioche e muito queijo derretido.',
    pratos: [['Hambúrgueres', 'Big Hambúrguer Duplo', 'Dois blends de 150 g, cheddar, bacon e cebola caramelizada', 39, 'burger', true], ['Acompanhamentos', 'Batata rústica', 'Com páprica e maionese da casa', 15], ['Bebidas', 'Milkshake de ovomaltine', '400 ml', 19]] }
];
const SLUGS = EXEMPLOS.map(e => e.slug);
const SENHA_DEMO = 'demo12345';

async function criarVitrineExemplo(c, { reset } = {}) {
  if (reset) await c.query('DELETE FROM restaurantes WHERE slug = ANY($1)', [SLUGS]);
  const criados = [];
  for (const e of EXEMPLOS) {
    if ((await c.query('SELECT 1 FROM restaurantes WHERE slug = $1', [e.slug])).rowCount) continue;
    const email = 'dono@' + e.slug + '.demo';
    await c.query('DELETE FROM usuarios WHERE email = $1', [email]);
    const bairros = BAIRROS.map((b, i) => ({ nome: b.nome, taxa: e.taxas ? e.taxas[i] : b.taxa }));
    const { rest } = await criarRestaurante(c, { nome: e.nome, slug: e.slug, email, senha: SENHA_DEMO, nomeDono: 'Dono', mesas: 6, extras: {
      frase: e.sobre.split(/[.:]/)[0], sobre: e.sobre, categoriaVitrine: e.cat, capaUrl: F(e.capa), cor: e.cor, abre: '10:00', fecha: '23:30', aceitarForaDoHorario: true,
      chavePix: 'pix@' + e.slug + '.demo', categorias: [...new Set(e.pratos.map(p => p[0]))],
      delivery: { ativo: true, tempo: e.tempo, tempoRetirada: '15–25 min', pedidoMinimo: 0, gratisAcimaDe: e.gratis, bairros } } });
    for (const p of e.pratos) await repo.criarProduto(c, rest.id, { categoria: p[0], nome: p[1], descricao: p[2], preco: p[3], fotoUrl: p[4] ? F(p[4]) : '', destaque: !!p[5], selos: [], opcoes: [], esgotado: false });
    const hash = await bcrypt.hash(SENHA_DEMO, 10);
    await c.query('DELETE FROM usuarios WHERE email = $1', ['entrega@' + e.slug + '.demo']);
    await c.query("INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1, 'Entregador', $2, 'entregador', $3)", [rest.id, 'entrega@' + e.slug + '.demo', hash]);
    criados.push(rest);
  }
  return criados;
}

// Clientes, pedidos entregues e avaliações de exemplo (só para demonstração)
const COMENTARIOS = ['Chegou quentinho e muito bem embalado. Peço de novo com certeza!', 'Atendimento rápido e comida caprichada. Virou meu preferido.', 'Melhor que eu esperava, porção generosa e o entregador foi super educado.', 'Bom, mas demorou um pouco mais que o previsto.', 'Sabor de comida caseira, recomendo para a família toda.', 'Preço justo e qualidade excelente.'];
async function avaliacoesExemplo(c) {
  const nomes = ['Juliana Rocha', 'Marcos Teixeira', 'Patrícia Lima', 'Rafael Souza', 'Camila Nunes', 'Thiago Alves'];
  const hash = await bcrypt.hash('cliente12345', 10), clientes = [];
  for (let i = 0; i < nomes.length; i++) {
    const email = 'cliente' + (i + 1) + '@chefonline.demo';
    let cl = (await c.query('SELECT id FROM clientes WHERE email = $1', [email])).rows[0];
    if (!cl) cl = (await c.query('INSERT INTO clientes (nome, email, senha_hash, telefone) VALUES ($1,$2,$3,$4) RETURNING id', [nomes[i], email, hash, '(15) 99876-54' + (10 + i)])).rows[0];
    clientes.push({ id: cl.id, nome: nomes[i] });
  }
  let n = 0, k = 0;
  const rests = (await c.query('SELECT id, slug FROM restaurantes WHERE slug = ANY($1)', [SLUGS])).rows;
  for (const r of rests) {
    const prods = (await c.query('SELECT id, nome, preco FROM produtos WHERE restaurante_id = $1', [r.id])).rows;
    const qtd = 3 + (k % 3);
    for (let j = 0; j < qtd; j++, k++) {
      const cl = clientes[k % clientes.length], pr = prods[j % prods.length], num = (await c.query('UPDATE restaurantes SET seq_pedido = seq_pedido + 1 WHERE id = $1 RETURNING seq_pedido', [r.id])).rows[0].seq_pedido;
      const quando = new Date(Date.now() - (2 + k) * 86400000 * 0.7);
      const p = (await c.query(`INSERT INTO pedidos (restaurante_id, numero, tipo, cliente_nome, cliente_tel, entrega_endereco, entrega_bairro, subtotal, servico, taxa_entrega, total, pag_metodo, pag_pago, status, codigo_acomp, cliente_id, criado_em)
        VALUES ($1,$2,'delivery',$3,'(15) 99999-0000','Rua das Flores, 100','Centro',$4,0,0,$4,'pix',true,'entregue',$5,$6,$7) RETURNING id`, [r.id, num, cl.nome, pr.preco, 'ex' + r.id.slice(0, 6) + num, cl.id, quando])).rows[0];
      await c.query('INSERT INTO pedido_itens (pedido_id, restaurante_id, produto_id, nome, qtd, unit) VALUES ($1,$2,$3,$4,1,$5)', [p.id, r.id, pr.id, pr.nome, pr.preco]);
      await c.query("INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por, em) VALUES ($1,$2,'entregue','exemplo',$3)", [p.id, r.id, quando]);
      const nota = [5, 5, 4, 3, 5, 5][k % 6];
      await c.query('INSERT INTO avaliacoes (restaurante_id, cliente_id, pedido_id, nota, comentario, criado_em) VALUES ($1,$2,$3,$4,$5,$6)', [r.id, cl.id, p.id, nota, COMENTARIOS[k % COMENTARIOS.length], quando]);
      n++;
    }
  }
  return n;
}

module.exports = { criarVitrineExemplo, avaliacoesExemplo, SLUGS, SENHA_DEMO };
