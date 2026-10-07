// Cria o restaurante de exemplo "Casa Jabuticaba" com cardápio, mesas e equipe.
// Uso: npm run seed            (não apaga nada se o restaurante já existir)
//      npm run seed -- --reset (apaga e recria SOMENTE o restaurante de exemplo)
//      npm run seed -- --reset --com-historico (inclui 30 dias de pedidos, clientes e avaliações de exemplo, para demonstrações)
const bcrypt = require('bcryptjs');
const { conectar, sistema, encerrar } = require('../db');
const config = require('../config');
const repo = require('../lib/repo');
const { criarRestaurante } = require('../lib/criarRestaurante');
const { criarVitrineExemplo, avaliacoesExemplo, SENHA_DEMO } = require('../lib/vitrineExemplo');

const SLUG = 'casa-jabuticaba';
const SENHA = 'jabuticaba123';

// Pedidos de exemplo dos últimos 30 dias (só com --com-historico), para demonstrar relatórios
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

(async () => {
  try {
    await conectar();
    const msg = await sistema(async c => {
      const ex = (await c.query('SELECT id FROM restaurantes WHERE slug = $1', [SLUG])).rows[0];
      const reset = process.argv.includes('--reset');
      if (ex && !reset) return 'O restaurante de exemplo já existe. Use "npm run seed -- --reset" para recriá-lo.';
      const vitrine = await criarVitrineExemplo(c, { reset });
      if (ex) await c.query('DELETE FROM restaurantes WHERE id = $1', [ex.id]); // apaga tudo dele em cascata
      const { rest } = await criarRestaurante(c, {
        nome: 'Casa Jabuticaba', slug: SLUG, email: 'dono@casajabuticaba.com', senha: SENHA, nomeDono: 'Dona Lúcia', mesas: 12,
        extras: { frase: 'Cozinha mineira contemporânea', sobre: 'Comida mineira de verdade: pão de queijo saindo do forno, tutu, torresmo e doce de leite de tacho.', categoriaVitrine: 'Mineira', capaUrl: '/img/chef/queijos.jpg', cor: '#2F5D46', abre: '11:00', fecha: '23:30', aceitarForaDoHorario: true, taxaServico: 10, chavePix: 'pix@casajabuticaba.com',
          categorias: ['Entradas', 'Pratos principais', 'Sobremesas', 'Bebidas'],
          delivery: { ativo: true, tempo: '40–50 min', tempoRetirada: '20–30 min', pedidoMinimo: 40, gratisAcimaDe: 120,
            bairros: [{ nome: 'Centro', taxa: 6 }, { nome: 'Jardim América', taxa: 8 }, { nome: 'Vila Nova', taxa: 10 }, { nome: 'Campolim', taxa: 12 }] } }
      });
      const hash = await bcrypt.hash(SENHA, 10);
      for (const [nome, email, papel] of [['Cozinha', 'cozinha@casajabuticaba.com', 'cozinha'], ['Carlos', 'carlos@casajabuticaba.com', 'entregador'], ['Rafa', 'rafa@casajabuticaba.com', 'entregador']])
        await c.query('INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1,$2,$3,$4,$5)', [rest.id, nome, email, papel, hash]);
      const ponto = { nome: 'Ponto da carne', tipo: 'um', escolhas: [{ nome: 'Mal passada', preco: 0 }, { nome: 'Ao ponto', preco: 0 }, { nome: 'Bem passada', preco: 0 }] };
      const P = (categoria, nome, descricao, preco, selos = [], opcoes = [], x = {}) => Object.assign({ categoria, nome, descricao, preco, selos, opcoes, fotoUrl: '', esgotado: false, destaque: false }, x);
      const produtos = [
        P('Entradas', 'Pão de queijo da casa', 'Queijo canastra, saído do forno', 24, ['vegetariano', 'sem glúten'], [{ nome: 'Tamanho', tipo: 'um', escolhas: [{ nome: '8 unidades', preco: 0 }, { nome: '16 unidades', preco: 18 }] }]),
        P('Entradas', 'Bolinho de mandioca com carne-seca', '6 unidades, maionese de ervas', 38),
        P('Entradas', 'Torresmo de rolo', 'Crocante, com limão e pimenta biquinho', 42, ['sem glúten']),
        P('Pratos principais', 'Picanha na chapa', '300 g, arroz, feijão tropeiro e vinagrete', 98, ['sem glúten'], [ponto, { nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Ovo frito', preco: 4 }, { nome: 'Queijo coalho', preco: 9 }, { nome: 'Farofa de bacon', preco: 7 }] }], { destaque: true }),
        P('Pratos principais', 'Frango com quiabo e angu', 'Serve 1 pessoa · acompanha arroz', 64, ['sem glúten']),
        P('Pratos principais', 'Tutu de feijão completo', 'Linguiça, couve, ovo, torresmo e arroz', 72, [], [{ nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Linguiça extra', preco: 8 }, { nome: 'Ovo extra', preco: 4 }] }]),
        P('Pratos principais', 'Moqueca de palmito', 'Leite de coco, dendê e arroz de coentro', 68, ['vegano', 'sem glúten']),
        P('Sobremesas', 'Doce de leite com queijo', 'Queijo minas frescal e doce de leite de tacho', 26, ['vegetariano', 'sem glúten']),
        P('Sobremesas', 'Pudim de tapioca', 'Calda de jabuticaba', 24, ['vegetariano'], [], { esgotado: true }),
        P('Bebidas', 'Suco de jabuticaba', '500 ml, feito na hora', 16, ['vegano'], [{ nome: 'Preparo', tipo: 'um', escolhas: [{ nome: 'Com açúcar', preco: 0 }, { nome: 'Sem açúcar', preco: 0 }, { nome: 'Com adoçante', preco: 0 }] }]),
        P('Bebidas', 'Cerveja artesanal 600 ml', 'Pilsen da casa, bem gelada', 29, ['vegano']),
        P('Bebidas', 'Cachaça artesanal (dose)', 'Envelhecida em amburana', 18, ['vegano'])
      ];
      const criados = [];
      for (const p of produtos) criados.push(await repo.criarProduto(c, rest.id, p));
      let nHist = 0;
      if (process.argv.includes('--com-historico')) nHist = await gerarHistorico(c, rest, criados);
      const base = config.urlPublica || `http://localhost:${config.porta}`;
      const mesa1 = (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = 1', [rest.id])).rows[0];
      const linhas = ['', 'Restaurante de exemplo pronto: Casa Jabuticaba',
        `  Cardápio de delivery: ${base}/r/${SLUG}`, `  Exemplo de QR da Mesa 1: ${base}/r/${SLUG}/mesa/1?t=${mesa1.token}`, `  Painel: ${base}/painel`,
        `  Logins (senha ${SENHA}): dono@casajabuticaba.com · cozinha@casajabuticaba.com · carlos@casajabuticaba.com`];
      if (!(await c.query('SELECT 1 FROM admins LIMIT 1')).rowCount) {
        // Primeiro acesso de dev: ADMIN_INICIAL_EMAIL e ADMIN_INICIAL_SENHA (útil no plano gratuito do Render, que não tem Shell)
        const emailAdm = (process.env.ADMIN_INICIAL_EMAIL || '').trim().toLowerCase(), senhaAdm = process.env.ADMIN_INICIAL_SENHA || '';
        if (emailAdm && senhaAdm.length >= 10) {
          await c.query('INSERT INTO admins (nome, email, senha_hash) VALUES ($1, $2, $3)', [process.env.ADMIN_INICIAL_NOME || 'Dev', emailAdm, await bcrypt.hash(senhaAdm, 10)]);
          linhas.push(`  Área de devs: ${base}/admin  (${emailAdm} / a senha de ADMIN_INICIAL_SENHA)`);
        } else {
          if (emailAdm) linhas.push('  Aviso: ADMIN_INICIAL_SENHA precisa ter pelo menos 10 caracteres. Usando o acesso de dev padrão.');
          await c.query('INSERT INTO admins (nome, email, senha_hash) VALUES ($1, $2, $3)', ['Dev', 'dev@cardapio.dev', await bcrypt.hash('devs-troque-esta-senha', 10)]);
          linhas.push(`  Área de devs: ${base}/admin  (dev@cardapio.dev / devs-troque-esta-senha — crie a sua conta com "npm run novo-admin" e desative esta)`);
        }
      }
      let nAv = 0;
      if (process.argv.includes('--com-historico')) nAv = await avaliacoesExemplo(c);
      linhas.push(`  ChefOnline (vitrine com vários restaurantes): ${base}/  · ${vitrine.length} restaurantes de exemplo criados (donos: dono@<endereço>.demo / ${SENHA_DEMO})`);
      if (nAv) linhas.push(`  ${nAv} avaliações de exemplo e clientes de teste (cliente1@chefonline.demo / cliente12345).`);
      if (nHist) linhas.push(`  ${nHist} pedidos de exemplo dos últimos 30 dias criados (para o histórico, o balanço e o mapa das mesas).`);
      linhas.push('  Troque essas senhas antes de usar com clientes reais.', '');
      return linhas.join('\n');
    });
    console.log(msg);
  } catch (e) { console.error('Erro ao criar o exemplo:', e.message); process.exitCode = 1; }
  await encerrar();
})();
