const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const HistoricoContato = require('../models/HistoricoContato');
const Card = require('../models/Card');

const router = express.Router();
router.use(auth);

// GET /api/historico-contato/:cardId -> lista o histórico daquele lead, mais recente primeiro
router.get('/:cardId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.cardId)) return res.status(400).json({ error: 'Lead inválido.' });
    const itens = await HistoricoContato.find({ userId: req.userId, cardId: req.params.cardId }).sort('-createdAt');
    res.json({ itens: itens.map((i) => i.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o histórico.' });
  }
});

// POST /api/historico-contato -> adiciona um novo registro
router.post('/', async (req, res) => {
  try {
    const { cardId, texto } = req.body;
    if (!cardId || !mongoose.isValidObjectId(cardId)) return res.status(400).json({ error: 'Lead inválido.' });
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Escreva o que aconteceu.' });
    const lead = await Card.findOne({ _id: cardId, userId: req.userId });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    const item = await HistoricoContato.create({ userId: req.userId, cardId, texto: texto.trim() });
    res.status(201).json(item.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar o histórico.' });
  }
});

// PUT /api/historico-contato/:id -> edita o texto de um registro existente
router.put('/:id', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Escreva o que aconteceu.' });
    const item = await HistoricoContato.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { texto: texto.trim() },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Registro não encontrado.' });
    res.json(item.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao editar o registro.' });
  }
});

// DELETE /api/historico-contato/:id -> remove um registro (ex: escreveu errado)
router.delete('/:id', async (req, res) => {
  try {
    await HistoricoContato.deleteOne({ _id: req.params.id, userId: req.userId });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir o registro.' });
  }
});

module.exports = router;
