const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Column = require('../models/Column');
const Card = require('../models/Card');
const Funil = require('../models/Funil');

const router = express.Router();
router.use(auth); // todas as rotas de coluna exigem login

// POST /api/columns -> cria uma nova coluna para o usuário logado, dentro de um funil
router.post('/', async (req, res) => {
  try {
    const { nome, tipo, funilId } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome da coluna é obrigatório.' });
    }
    if (!funilId || !mongoose.isValidObjectId(funilId)) {
      return res.status(400).json({ error: 'Funil inválido.' });
    }
    const funil = await Funil.findOne({ _id: funilId, userId: req.userId });
    if (!funil) return res.status(404).json({ error: 'Funil não encontrado.' });

    const total = await Column.countDocuments({ userId: req.userId, funilId });
    const coluna = await Column.create({
      userId: req.userId,
      funilId,
      nome: nome.trim(),
      tipo: tipo || 'aberto',
      ordem: total,
    });
    res.status(201).json(coluna.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar coluna.' });
  }
});

// PUT /api/columns/:id -> renomeia, muda o tipo e/ou a ordem (só se for do usuário logado)
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const updates = {};
    if (typeof req.body.nome === 'string') updates.nome = req.body.nome.trim();
    if (typeof req.body.tipo === 'string') updates.tipo = req.body.tipo;
    if (typeof req.body.ordem === 'number') updates.ordem = req.body.ordem;
    if (typeof req.body.probabilidade === 'number') {
      updates.probabilidade = Math.max(0, Math.min(100, req.body.probabilidade));
    }

    const coluna = await Column.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!coluna) return res.status(404).json({ error: 'Coluna não encontrada.' });
    res.json(coluna.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar coluna.' });
  }
});

// DELETE /api/columns/:id -> remove a coluna e os cards dela (só se for do usuário logado)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const coluna = await Column.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!coluna) return res.status(404).json({ error: 'Coluna não encontrada.' });
    await Card.deleteMany({ columnId: req.params.id, userId: req.userId });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir coluna.' });
  }
});

module.exports = router;
