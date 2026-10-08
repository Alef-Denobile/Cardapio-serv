// Restaurante de demonstração "Sabor da Casa": cardápio variado com fotos, equipe, mesas,
// 30 dias de pedidos de exemplo (relatórios e mapa de calor) e avaliações.
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
const CATEGORIAS = ['Hambúrgueres', 'Bebidas', 'Sobremesas'];
const MOLHO = { nome: 'Molho', tipo: 'um', escolhas: [{ nome: 'Bolonhesa', preco: 0 }, { nome: 'Branco', preco: 0 }, { nome: 'Sugo', preco: 0 }, { nome: 'Quatro queijos', preco: 6 }] };
// [categoria, nome, descrição, preço, foto, destaque, selos, opções]
const PRATOS = [
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
const SUGERIR = ['Refrigerante lata', 'Brownie com sorvete', 'Suco natural 500 ml', 'Casquinha de chocolate', 'Milkshake de morango'];
// Estoque de exemplo: [nome, unidade, estoque, mínimo, custo por unidade]
const INSUMOS = [
  ['Pão de hambúrguer', 'un', 80, 15, 1.4], ['Pão brioche', 'un', 40, 10, 2.2], ['Blend bovino 150 g', 'un', 70, 15, 6.2], ['Smash 90 g', 'un', 60, 12, 3.6],
  ['Queijo cheddar', 'kg', 3, 0.5, 52], ['Bacon', 'kg', 0.6, 0.8, 45], ['Frango', 'kg', 10, 2, 22], ['Hambúrguer de grão-de-bico', 'un', 20, 5, 3.8],
  ['Refrigerante lata', 'un', 96, 24, 3.1], ['Água mineral', 'un', 60, 12, 1.2], ['Laranja', 'kg', 15, 3, 4.5], ['Limão', 'kg', 6, 1, 6],
  ['Leite', 'l', 12, 3, 5.2], ['Morango', 'kg', 3, 0.5, 18], ['Sorvete de creme', 'l', 6, 1.5, 22], ['Chocolate', 'kg', 2, 0.5, 48],
  ['Açaí', 'kg', 5, 1, 24], ['Leite condensado', 'un', 0, 4, 7.9]
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
  'Açaí na tigela 500 ml': [['Açaí', 0.4], ['Morango', 0.05]]
};
async function criarEstoque(c, rest, produtos) {
  const ids = {};
  for (const [nome, unidade, est, min, custo] of INSUMOS)
    ids[nome] = (await c.query('INSERT INTO insumos (restaurante_id, nome, unidade, estoque, minimo, custo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [rest.id, nome, unidade, est, min, custo])).rows[0].id;
  for (const p of produtos) for (const [ins, q] of (FICHAS[p.nome] || []))
    await c.query('INSERT INTO ficha_tecnica (restaurante_id, produto_id, insumo_id, qtd) VALUES ($1,$2,$3,$4)', [rest.id, p.id, ids[ins], q]);
}

// Pedidos de exemplo dos últimos 30 dias, para demonstrar relatórios e o mapa das mesas
async function gerarHistorico(c, rest, produtos) {
  let semente = 20261005;
  const rnd = () => { semente = semente + 0x6D2B79F5 | 0; let t = Math.imul(semente ^ semente >>> 15, 1 | semente); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const pesoMesa = [1.6, 1.2, 0.8, 2.0, 1.0, 0.55, 1.4, 0.9, 0.45, 1.1, 0.7, 1.3], soma = pesoMesa.reduce((a, b) => a + b, 0);
  const mesa = () => { let r = rnd() * soma; for (let k = 0; k < pesoMesa.length; k++){ r -= pesoMesa[k]; if (r <= 0) return k + 1; } return 12; };
  const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Karen', 'Lucas', 'Marina', 'Nando', 'Olívia', 'Paulo'];
  const ruas = ['Rua das Flores', 'Av. São Paulo', 'Rua Sete de Setembro', 'Rua Padre Luiz', 'Av. Brasil'];
  const ents = (await c.query("SELECT id, nome FROM usuarios WHERE restaurante_id = $1 AND papel = 'entregador'", [rest.id])).rows;
  const disp = produtos.filter(p => !p.esgotado), bairros = rest.delivery.bairros;
  const cent = v => Math.round(v * 100) / 100;
  const agora = Date.now(), hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  let n = 0, num = 100;
  for (let d = 30; d >= 0; d--) {
    const dia = hoje0.getTime() - d * 86400000, dow = new Date(dia).getDay();
    const qtd = Math.round((dow === 5 || dow === 6 ? 31 : dow === 0 ? 27 : dow === 1 ? 14 : 20) * (0.85 + rnd() * 0.3));
    for (let k = 0; k < qtd; k++) {
      const h = rnd() < 0.45 ? 11 + Math.floor(rnd() * 3.5) : 18 + Math.floor(rnd() * 4.8);
      const ts = dia + h * 3600000 + Math.floor(rnd() * 60) * 60000;
      if (ts > agora - 15 * 60000) continue;
      const r = rnd(), tipo = r < 0.5 ? 'mesa' : r < 0.88 ? 'delivery' : 'retirada';
      const usados = new Set(), itens = [];
      for (let j = 0, nl = 1 + Math.floor(rnd() * 3); j < nl; j++) {
        const p = pick(disp); if (usados.has(p.id)) continue; usados.add(p.id);
        const ops = p.opcoes.filter(o => o.tipo === 'um').map(o => o.escolhas[0].nome);
        itens.push({ p, qtd: 1 + (rnd() < 0.35 ? 1 : 0) + (tipo === 'mesa' && rnd() < 0.2 ? 1 : 0), ops });
      }
      const sub = cent(itens.reduce((a, i) => a + i.p.preco * i.qtd, 0));
      const serv = tipo === 'mesa' ? cent(sub * rest.taxaServico / 100) : 0;
      const b = pick(bairros), ent = tipo === 'delivery' ? (rest.delivery.gratisAcimaDe && sub >= rest.delivery.gratisAcimaDe ? 0 : b.taxa) : 0;
      const pag = tipo === 'delivery' ? pick(['pix', 'pix', 'cartao', 'cartao', 'dinheiro']) : pick(['pix', 'local', 'local']);
      const e = tipo === 'delivery' ? pick(ents) : null;
      const pd = (await c.query(`INSERT INTO pedidos (restaurante_id, numero, tipo, mesa, cliente_nome, cliente_tel, entrega_endereco, entrega_bairro, subtotal, servico, taxa_entrega, total, pag_metodo, pag_pago, status, entregador_id, entregador_nome, codigo_acomp, criado_em, atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'entregue',$14,$15,$16,$17,$17) RETURNING id`,
        [rest.id, ++num, tipo, tipo === 'mesa' ? mesa() : null, pick(nomes), tipo === 'mesa' ? '' : '(15) 99' + (100 + Math.floor(rnd() * 899)) + '-' + (1000 + Math.floor(rnd() * 8999)),
          tipo === 'delivery' ? pick(ruas) + ', ' + (10 + Math.floor(rnd() * 900)) : null, tipo === 'delivery' ? b.nome : null, sub, serv, ent, cent(sub + serv + ent), pag, e && e.id, e && e.nome, 'exemplo' + num, new Date(ts)])).rows[0];
      const vals = [], ph = [];
      itens.forEach((i, x) => { vals.push(pd.id, rest.id, i.p.id, i.p.nome, i.qtd, i.p.preco, i.ops, x); const o = x * 8; ph.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`); });
      await c.query('INSERT INTO pedido_itens (pedido_id, restaurante_id, produto_id, nome, qtd, unit, opcoes, ordem) VALUES ' + ph.join(','), vals);
      await c.query("INSERT INTO pedido_historico (pedido_id, restaurante_id, status, por, em) VALUES ($1,$2,'novo','cliente',$3), ($1,$2,'entregue','exemplo',$4)", [pd.id, rest.id, new Date(ts), new Date(ts + 35 * 60000)]);
      n++;
    }
  }
  await c.query('UPDATE restaurantes SET seq_pedido = $2 WHERE id = $1', [rest.id, num]);
  return n;
}

// Avaliações de exemplo em pedidos entregues (sem conta de cliente, como no uso real)
const AVALIACOES = [
  ['Juliana Rocha', 5, 'Chegou quentinho e muito bem embalado. Peço de novo com certeza!'],
  ['Marcos Teixeira', 5, 'O hambúrguer duplo é o melhor da cidade. Suculento e bem servido.'],
  ['Patrícia Lima', 4, 'Hambúrguer suculento e porção generosa. Só demorou um pouquinho.'],
  ['Rafael Souza', 5, 'Atendimento rápido e comida caprichada. Virou o nosso preferido.'],
  ['Camila Nunes', 5, 'Pedi pela mesa com o QR Code e chegou certinho, sem erro nenhum.'],
  ['Thiago Alves', 4, 'O milkshake de morango é ótimo. Preço justo e qualidade excelente.']
];
async function avaliar(c, rest) {
  const ids = (await c.query("SELECT id FROM pedidos WHERE restaurante_id = $1 AND status = 'entregue' AND tipo = 'delivery' ORDER BY criado_em DESC LIMIT $2", [rest.id, AVALIACOES.length])).rows;
  for (let i = 0; i < ids.length; i++) {
    const [nome, nota, comentario] = AVALIACOES[i];
    await c.query('UPDATE pedidos SET cliente_nome = $2 WHERE id = $1', [ids[i].id, nome]);
    await c.query('INSERT INTO avaliacoes (restaurante_id, pedido_id, nota, comentario, criado_em) SELECT restaurante_id, id, $2, $3, LEAST(criado_em + interval \'1 hour\', now() - interval \'1 minute\') FROM pedidos WHERE id = $1', [ids[i].id, nota, comentario]);
  }
  return ids.length;
}

// c = conexão em contexto de sistema. Não mexe em nada se o exemplo já existe (a menos que reset).
async function criarDemo(c, { reset = false, historico = false } = {}) {
  const ex = (await c.query('SELECT id FROM restaurantes WHERE slug = $1', [SLUG])).rows[0];
  if (ex && !reset) return null;
  if (ex) await c.query('DELETE FROM restaurantes WHERE id = $1', [ex.id]); // apaga tudo dele em cascata
  // remove os exemplos das versões anteriores (só os de demonstração, pelos e-mails de exemplo)
  await c.query("DELETE FROM restaurantes r WHERE r.slug = ANY($1) AND EXISTS (SELECT 1 FROM usuarios u WHERE u.restaurante_id = r.id AND (u.email LIKE '%.demo' OR u.email LIKE '%@casajabuticaba.com'))", [ANTIGOS]);
  await c.query('DELETE FROM usuarios WHERE email = ANY($1)', [Object.values(EMAILS)]);
  const { rest } = await criarRestaurante(c, {
    nome: 'Sabor da Casa', slug: SLUG, email: EMAILS.dono, senha: SENHA, nomeDono: 'Dona Lúcia', mesas: 12,
    extras: { frase: 'Hambúrgueres artesanais, bebidas e sobremesas', sobre: 'Hamburgueria de bairro: blends grelhados na hora, pão brioche, milkshakes e sobremesas para fechar com chave de ouro.',
      capaUrl: F('burger'), cor: '#D23F3F', abre: '11:00', fecha: '23:30', aceitarForaDoHorario: true, taxaServico: 10, chavePix: 'pix@sabordacasa.com', whatsapp: '(15) 99999-0000',
      categorias: CATEGORIAS,
      delivery: { ativo: true, tempo: '35–45 min', tempoRetirada: '20–30 min', pedidoMinimo: 30, gratisAcimaDe: 100,
        bairros: [{ nome: 'Centro', taxa: 6 }, { nome: 'Jardim América', taxa: 8 }, { nome: 'Vila Nova', taxa: 10 }, { nome: 'Campolim', taxa: 12 }],
        // já deixa a taxa por distância pronta: basta trocar o modo nas configurações do painel
        modo: 'bairro', local: { lat: -23.5016, lng: -47.4581, endereco: 'Centro, Sorocaba - SP (endereço de exemplo)' },
        faixas: [{ ate: 3, taxa: 6 }, { ate: 5, taxa: 8 }, { ate: 8, taxa: 11 }, { ate: 12, taxa: 15 }] },
      agendamento: { ativo: true, antecedencia: 60, dias: 2, preparo: 45 },
      fiscal: { cnpj: '', ie: '', razao: 'Sabor da Casa Restaurante LTDA (exemplo)', regime: '1', ambiente: 'homologacao', auto: false, ncm: '21069090', cfop: '5102', csosn: '102' } }
  });
  // NFC-e em modo de demonstração e totem já liberados no exemplo
  await c.query('UPDATE restaurantes SET rec_nfce = true, rec_totem = true, totem_token = $2 WHERE id = $1', [rest.id, require('./util').tokenAleatorio(12)]);
  const hash = await bcrypt.hash(SENHA, 10);
  for (const [nome, email, papel] of [['Cozinha', EMAILS.cozinha, 'cozinha'], ['Carlos', EMAILS.carlos, 'entregador'], ['Rafa', EMAILS.rafa, 'entregador']])
    await c.query('INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1,$2,$3,$4,$5)', [rest.id, nome, email, papel, hash]);
  const criados = [];
  for (const [categoria, nome, descricao, preco, foto, destaque, selos, opcoes] of PRATOS)
    criados.push(await repo.criarProduto(c, rest.id, { categoria, nome, descricao, preco, selos, opcoes, fotoUrl: /^https?:\/\//.test(foto) ? foto : (foto ? F(foto) : ''), esgotado: false, destaque }));
  await c.query('UPDATE produtos SET sugerir = true WHERE restaurante_id = $1 AND nome = ANY($2)', [rest.id, SUGERIR]);
  await criarEstoque(c, rest, criados);
  const nHist = historico ? await gerarHistorico(c, rest, criados) : 0;
  // custo dos itens vendidos pela ficha técnica, para o relatório de lucro por prato
  if (historico) await c.query(`UPDATE pedido_itens i SET custo = x.custo FROM (SELECT f.produto_id, sum(f.qtd * n.custo) AS custo FROM ficha_tecnica f JOIN insumos n ON n.id = f.insumo_id WHERE f.restaurante_id = $1 GROUP BY f.produto_id) x
    WHERE i.restaurante_id = $1 AND i.produto_id = x.produto_id`, [rest.id]);
  const nAv = historico ? await avaliar(c, rest) : 0;
  return { rest, nHist, nAv };
}

module.exports = { criarDemo, SLUG, SENHA, EMAILS };
