const Contrato = require('../models/Contrato');
const Column = require('../models/Column');
const Card = require('../models/Card');
const { calcComissaoPorRegra } = require('./comissaoCalc');
const { obterRegraPorChave } = require('./regrasComissao');

// Quando um cliente entra numa coluna do tipo "ganho" (fechado), gera a comissão
// dele automaticamente na aba Comissões — só uma vez por cliente, mesmo que passe
// por mais de uma coluna "ganho" ou seja movido/editado depois. Nunca lança erro
// pra fora: se algo der errado aqui, a ação principal (mover/criar o card) segue
// normalmente, só não gera a comissão dessa vez.
async function gerarComissaoAutomaticaSeGanho(userId, card, columnId) {
  try {
    const coluna = await Column.findOne({ _id: columnId, userId });
    if (!coluna || coluna.tipo !== 'ganho') return;

    const credito = parseFloat(card.valor) || 0;
    if (credito <= 0) return; // sem valor cadastrado, nada pra comissionar

    const jaExiste = await Contrato.findOne({ cardId: card._id });
    if (jaExiste) return; // já foi gerada antes pra esse cliente, não duplica

    const regra = await obterRegraPorChave(userId, card.tipoCarta);
    const { parcelas, parcelas1, value, value2, blocos } = calcComissaoPorRegra(credito, regra);
    // Usa o "mês" que a pessoa definiu no lead como referência — só cai pra data de hoje
    // se o lead não tiver esse campo preenchido. Aceita tanto "YYYY-MM" (formato antigo)
    // quanto "YYYY-MM-DD" (com dia, formato atual) — sempre usa o dia 1 do mês
    // correspondente, já que a comissão sempre trabalha em parcelas mensais.
    const mesValido = /^\d{4}-\d{2}/.test(card.mes || '');
    const hoje = new Date();
    const dataReferencia = mesValido
      ? new Date(Number(card.mes.slice(0, 4)), Number(card.mes.slice(5, 7)) - 1, 1)
      : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    if (!mesValido) {
      // o lead ganhou sem "mês de venda" preenchido — registra a data de hoje ali
      // também, pra ficar visível no próprio lead, não só escondida na comissão
      const mesDeHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      await Card.updateOne({ _id: card._id, userId }, { mes: mesDeHoje });
    }
    await Contrato.create({
      userId,
      cardId: card._id,
      geradoAutomaticamente: true,
      desc: card.cliente || 'Cliente',
      scope: 'Pessoal',
      date: dataReferencia,
      creditoValor: credito,
      tipoCarta: card.tipoCarta || 'imovel',
      regraNome: regra.nome || '',
      parcelas,
      parcelas1,
      value,
      value2,
      blocos,
    });
  } catch (err) {
    console.error('Erro ao gerar comissão automática:', err.message);
  }
}

// Quando um cliente que JÁ tinha comissão gerada (estava numa coluna "ganho") é
// movido pra uma coluna do tipo "perdido" — cobrindo tanto "nunca fechou" quanto
// "fechou e depois cancelou" — corta a comissão dele a partir do mês desse movimento
// em diante. Meses anteriores (já vencidos) continuam contando normalmente.
async function cancelarComissaoSePerdidoAposGanho(userId, card, columnId) {
  try {
    const coluna = await Column.findOne({ _id: columnId, userId });
    if (!coluna || coluna.tipo !== 'perdido') return;

    const contrato = await Contrato.findOne({ cardId: card._id, userId });
    if (!contrato || contrato.canceladoNoMes) return; // sem contrato, ou já estava cancelado — não mexe

    const hoje = new Date();
    contrato.canceladoNoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    await contrato.save();
  } catch (err) {
    console.error('Erro ao cancelar comissão automaticamente:', err.message);
  }
}

module.exports = { gerarComissaoAutomaticaSeGanho, cancelarComissaoSePerdidoAposGanho };
