const Automacao = require('../models/Automacao');
const Card = require('../models/Card');
const Task = require('../models/Task');
const { gerarComissaoAutomaticaSeGanho } = require('./comissaoAutomatica');

// Roda periodicamente (chamado de server.js via setInterval). Olha só as
// automações do tipo "tempo_parado" e, pra cada cliente que já passou do
// prazo, executa a ação uma única vez (controlado por automacoesDisparadas).
async function verificarAutomacoesPorTempo() {
  try {
    const automacoes = await Automacao.find({ gatilhoTipo: 'tempo_parado', ativa: true });

    for (const auto of automacoes) {
      const dias = Number((auto.acaoParams && auto.acaoParams.diasParado) || 5);
      const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

      const cards = await Card.find({
        userId: auto.userId,
        columnId: auto.colunaGatilhoId,
        colunaDesde: { $lte: limite },
        automacoesDisparadas: { $ne: auto._id },
      });

      for (const card of cards) {
        try {
          if (auto.acaoTipo === 'criar_tarefa') {
            const diasVenc = Number((auto.acaoParams && auto.acaoParams.diasParaVencimento) || 3);
            const venc = new Date();
            venc.setDate(venc.getDate() + diasVenc);
            await Task.create({
              userId: auto.userId,
              titulo: (auto.acaoParams && auto.acaoParams.titulo) || 'Follow-up automático',
              vencimento: venc,
              prioridade: 'media',
              leadId: card._id,
              descricao: `Criada automaticamente pela automação "${auto.nome}" (cliente parado há ${dias}+ dias).`,
            });
            await Card.findByIdAndUpdate(card._id, { $addToSet: { automacoesDisparadas: auto._id } });
          } else if (auto.acaoTipo === 'mover_coluna') {
            const destino = auto.acaoParams && auto.acaoParams.colunaDestinoId;
            if (destino && String(destino) !== String(auto.colunaGatilhoId)) {
              // findByIdAndUpdate com columnId já reseta colunaDesde/automacoesDisparadas sozinho
              const atualizado = await Card.findByIdAndUpdate(card._id, { columnId: destino }, { new: true });
              gerarComissaoAutomaticaSeGanho(auto.userId, atualizado, destino);
            }
          }
        } catch (e) {
          console.error('Erro ao executar automação por tempo:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('Erro ao verificar automações por tempo:', e.message);
  }
}

module.exports = { verificarAutomacoesPorTempo };
