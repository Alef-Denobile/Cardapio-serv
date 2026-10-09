const RegraComissao = require('../models/RegraComissao');

/* ---- Regras padrão do sistema ----
   Mesma matemática que já existia fixa no código (comissaoCalc.js) — servem de "seed"
   pra cada usuário na primeira vez que ele acessa Comissões, assim ninguém vê nenhuma
   mudança de valor a menos que abra a engrenagem e edite algo. */
const REGRAS_PADRAO = [
  { chave: 'imovel', nome: 'Imóvel', blocos: [{ parcelas: 10, percentual: 1033.88 / 1000000 }, { parcelas: 3, percentual: 1905.61 / 1000000 }], mesIndependente: false, padrao: true, ordem: 0 },
  { chave: 'investimento', nome: 'Investimento', blocos: [{ parcelas: 10, percentual: 1033.88 / 1000000 }, { parcelas: 3, percentual: 1905.61 / 1000000 }], mesIndependente: false, padrao: true, ordem: 1 },
  { chave: 'servicos', nome: 'Serviços', blocos: [{ parcelas: 10, percentual: 1033.88 / 1000000 }, { parcelas: 3, percentual: 1905.61 / 1000000 }], mesIndependente: false, padrao: true, ordem: 2 },
  { chave: 'veiculo', nome: 'Veículo', blocos: [{ parcelas: 11, percentual: 0.016 / 11 }], mesIndependente: false, padrao: true, ordem: 3 },
  { chave: 'home_equity', nome: 'Home Equity', blocos: [{ parcelas: 1, percentual: 0.011 }], mesIndependente: true, padrao: true, ordem: 4 },
  { chave: 'car_equity', nome: 'Car Equity', blocos: [{ parcelas: 1, percentual: 0.011 }], mesIndependente: true, padrao: true, ordem: 5 },
];

// Garante que o usuário tenha regras cadastradas — na primeira vez, cria as padrão.
// Sempre devolve em ordem de exibição.
async function obterRegrasDoUsuario(userId) {
  const existentes = await RegraComissao.find({ userId });
  if (existentes.length > 0) {
    return existentes.sort((a, b) => a.ordem - b.ordem);
  }
  const criadas = await RegraComissao.insertMany(
    REGRAS_PADRAO.map((r) => ({ ...r, userId }))
  );
  return criadas.sort((a, b) => a.ordem - b.ordem);
}

// Busca uma regra específica pela chave (ex: "imovel"). Se por algum motivo não existir
// (usuário excluiu a regra, dado antigo com chave que não bate com nada), cai pra uma
// regra padrão equivalente sem nunca quebrar o cálculo — na pior das hipóteses, uma
// regra genérica de 1 parcela e 0%.
async function obterRegraPorChave(userId, chave) {
  const regras = await obterRegrasDoUsuario(userId);
  const encontrada = regras.find((r) => r.chave === chave);
  if (encontrada) return encontrada;
  const padrao = REGRAS_PADRAO.find((r) => r.chave === chave);
  if (padrao) return { ...padrao, userId };
  return { chave: chave || 'imovel', nome: chave || 'Imóvel', blocos: [{ parcelas: 1, percentual: 0 }], mesIndependente: false, padrao: false };
}

// Transforma um nome digitado pelo usuário ("Consórcio Pesado") numa chave técnica
// estável ("consorcio_pesado"), sem acento nem espaço.
function slugify(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'regra';
}

// Gera uma chave única pra esse usuário a partir do nome — se já existir, acrescenta um
// sufixo numérico (ex: "veiculo_2") até achar uma livre.
async function gerarChaveUnica(userId, nome, ignorarId) {
  const base = slugify(nome);
  const existentes = await RegraComissao.find({ userId, ...(ignorarId ? { _id: { $ne: ignorarId } } : {}) }).select('chave');
  const chavesUsadas = new Set(existentes.map((r) => r.chave));
  if (!chavesUsadas.has(base)) return base;
  let n = 2;
  while (chavesUsadas.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

module.exports = { REGRAS_PADRAO, obterRegrasDoUsuario, obterRegraPorChave, slugify, gerarChaveUnica };
