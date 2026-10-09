const Column = require('./models/Column');
const Funil = require('./models/Funil');

// Roda uma vez para cada usuário novo (chamado no cadastro),
// criando o primeiro funil (com colunas padrão) para ele começar a trabalhar.
async function seedColunasPadrao(userId) {
  const funil = await Funil.create({ userId, nome: 'Funil Principal', ordem: 0 });
  await Column.insertMany([
    { userId, funilId: funil._id, nome: 'Leads', tipo: 'aberto', ordem: 0 },
    { userId, funilId: funil._id, nome: 'Qualificação', tipo: 'aberto', ordem: 1 },
    { userId, funilId: funil._id, nome: 'Negociação', tipo: 'aberto', ordem: 2 },
    { userId, funilId: funil._id, nome: 'Fechado — Vendido', tipo: 'ganho', ordem: 3 },
    { userId, funilId: funil._id, nome: 'Perdido', tipo: 'perdido', ordem: 4 },
  ]);
}

module.exports = { seedColunasPadrao };
