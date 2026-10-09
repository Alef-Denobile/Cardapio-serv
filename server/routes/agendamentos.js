const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const MensagemAgendada = require('../models/MensagemAgendada');
const Card = require('../models/Card');

const router = express.Router();
router.use(auth); // todas as rotas de agendamento exigem login

// GET /api/agendamentos -> lista as mensagens agendadas do usuário, com contagem por status
router.get('/', async (req, res) => {
  try {
    const mensagens = await MensagemAgendada.find({ userId: req.userId }).sort({ agendadoPara: 1 });
    const cardIds = [...new Set(mensagens.map((m) => m.cardId.toString()))];
    const cards = await Card.find({ _id: { $in: cardIds } }).select('cliente telefone');
    const mapaCards = new Map(cards.map((c) => [c._id.toString(), c]));

    const contagem = { pendente: 0, enviada: 0, cancelada: 0, falhou: 0 };
    const lista = mensagens.map((m) => {
      contagem[m.status] = (contagem[m.status] || 0) + 1;
      const json = m.toJSON();
      const card = mapaCards.get(m.cardId.toString());
      json.clienteNome = card ? card.cliente : 'Cliente removido';
      return json;
    });

    res.json({ mensagens: lista, contagem });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os agendamentos.' });
  }
});

// POST /api/agendamentos -> agenda uma nova mensagem
router.post('/', async (req, res) => {
  try {
    const { cardId, texto, agendadoPara } = req.body;
    if (!cardId || !mongoose.isValidObjectId(cardId)) return res.status(400).json({ error: 'Escolha um cliente.' });
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Escreva o texto da mensagem.' });
    if (!agendadoPara) return res.status(400).json({ error: 'Escolha a data e hora do envio.' });
    const data = new Date(agendadoPara);
    if (Number.isNaN(data.getTime())) return res.status(400).json({ error: 'Data inválida.' });
    if (data.getTime() < Date.now() - 60 * 1000) return res.status(400).json({ error: 'Escolha um horário no futuro.' });

    const card = await Card.findOne({ _id: cardId, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    if (!card.telefoneNormalizado) return res.status(400).json({ error: 'Esse cliente não tem telefone cadastrado.' });

    const agendamento = await MensagemAgendada.create({
      userId: req.userId,
      cardId,
      texto: texto.trim(),
      agendadoPara: data,
    });
    const json = agendamento.toJSON();
    json.clienteNome = card.cliente;
    res.status(201).json(json);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao agendar a mensagem.' });
  }
});

// POST /api/agendamentos/:id/cancelar -> cancela um agendamento que ainda não foi enviado
router.post('/:id/cancelar', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const agendamento = await MensagemAgendada.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId, status: 'pendente' },
      { status: 'cancelada' },
      { new: true }
    );
    if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado ou já processado.' });
    res.json(agendamento.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cancelar o agendamento.' });
  }
});

// DELETE /api/agendamentos/:id -> remove da lista (qualquer status)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const agendamento = await MensagemAgendada.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir o agendamento.' });
  }
});

module.exports = router;
