const Task = require('../models/Task');
const Card = require('../models/Card');
const { gerarComissaoAutomaticaSeGanho } = require('./comissaoAutomatica');

// Aplica a ação de UMA automação (criar_tarefa ou mover_coluna) num card específico.
// Usado tanto pelo disparo automático (quando o card entra na coluna gatilho) quanto
// pelo botão "Executar agora" na tela de Conversas — mesma lógica nos dois casos.
async function executarAcaoDeAutomacao(userId, auto, card) {
  if (auto.acaoTipo === 'criar_tarefa') {
    const dias = (auto.acaoParams && auto.acaoParams.diasParaVencimento) || 3;
    const venc = new Date();
    venc.setDate(venc.getDate() + Number(dias));
    await Task.create({
      userId,
      titulo: (auto.acaoParams && auto.acaoParams.titulo) || 'Follow-up automático',
      vencimento: venc,
      prioridade: 'media',
      leadId: card._id,
      descricao: `Criada pela automação "${auto.nome}".`,
    });
  } else if (auto.acaoTipo === 'mover_coluna') {
    const destino = auto.acaoParams && auto.acaoParams.colunaDestinoId;
    if (destino && String(destino) !== String(card.columnId)) {
      const atualizado = await Card.findByIdAndUpdate(card._id, { columnId: destino }, { new: true });
      gerarComissaoAutomaticaSeGanho(userId, atualizado, destino);
    }
  }
}

module.exports = { executarAcaoDeAutomacao };
