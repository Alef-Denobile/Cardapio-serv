const bcrypt = require('bcryptjs');
const repo = require('./repo');
const { tokenAleatorio } = require('./util');
const tipos = require('./tipos');

// c = conexão em contexto de sistema
async function criarRestaurante(c, { nome, slug, email, senha, nomeDono = 'Dono', mesas = 10, extras = {}, tipo } = {}) {
  if (!nome || !slug || !email || !senha) throw new Error('Informe nome, slug, e-mail e senha.');
  if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  email = String(email).toLowerCase();
  if ((await c.query('SELECT 1 FROM restaurantes WHERE slug = $1', [slug])).rowCount) throw new Error(`Já existe um restaurante com o endereço "${slug}".`);
  if ((await c.query('SELECT 1 FROM usuarios WHERE email = $1', [email])).rowCount) throw new Error(`Já existe uma conta com o e-mail ${email}.`);
  tipo = tipos.tipoDe(tipo);
  const id = (await c.query('INSERT INTO restaurantes (nome, slug, plano, tipo) VALUES ($1, $2, $3, $4) RETURNING id', [nome, slug, extras.plano || 'Básico', tipo])).rows[0].id;
  // ponto de partida do tipo (categorias, taxa de serviço, cor e funções); o que vier em "extras" vale mais
  const pre = tipos.TIPOS[tipo];
  await tipos.aplicarFuncoes(c, id, tipo);
  const resto = Object.assign({ categorias: pre.categorias, taxaServico: pre.taxaServico, cor: pre.cor }, extras); delete resto.plano;
  if (Object.keys(resto).length) await repo.salvarConfig(c, id, resto);
  await c.query('INSERT INTO usuarios (restaurante_id, nome, email, papel, senha_hash) VALUES ($1, $2, $3, $4, $5)', [id, nomeDono, email, 'dono', await bcrypt.hash(senha, 10)]);
  for (let n = 1; n <= mesas; n++) await c.query('INSERT INTO mesas (restaurante_id, numero, token) VALUES ($1, $2, $3)', [id, n, tokenAleatorio()]);
  return { rest: await repo.carregarRest(c, id) };
}

module.exports = { criarRestaurante };
