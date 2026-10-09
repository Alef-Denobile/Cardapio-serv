const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Funil = require('../models/Funil');
const Column = require('../models/Column');
const Card = require('../models/Card');

const router = express.Router();
router.use(auth); // todas as rotas de funil exigem login

// GET /api/funis -> lista os funis do usuário. Se ele ainda não tinha nenhum
// (contas criadas antes desse recurso existir), cria um "Funil Principal" e
// migra automaticamente as colunas antigas pra ele — nada se perde.
router.get('/', async (req, res) => {
  try {
    let funis = await Funil.find({ userId: req.userId }).sort({ ordem: 1, createdAt: 1 });
    if (!funis.length) {
      const novo = await Funil.create({ userId: req.userId, nome: 'Funil Principal', ordem: 0 });
      funis = [novo];
    }
    // qualquer coluna sem funil (de antes desse recurso existir) vai pro primeiro funil
    await Column.updateMany({ userId: req.userId, funilId: null }, { funilId: funis[0]._id });

    res.json({ funis: funis.map((f) => f.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar funis.' });
  }
});

// POST /api/funis -> cria um novo funil (vazio — as colunas são adicionadas depois, na aba Pipeline)
router.post('/', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome do funil é obrigatório.' });
    const total = await Funil.countDocuments({ userId: req.userId });
    const funil = await Funil.create({ userId: req.userId, nome: nome.trim(), ordem: total });
    res.status(201).json(funil.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar funil.' });
  }
});

// PUT /api/funis/:id -> renomeia o funil
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const updates = {};
    if (typeof req.body.nome === 'string') updates.nome = req.body.nome.trim();

    const funil = await Funil.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true, runValidators: true });
    if (!funil) return res.status(404).json({ error: 'Funil não encontrado.' });
    res.json(funil.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar funil.' });
  }
});

// DELETE /api/funis/:id -> exclui o funil e, em cascata, as colunas e clientes dele
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });

    const totalFunis = await Funil.countDocuments({ userId: req.userId });
    if (totalFunis <= 1) {
      return res.status(400).json({ error: 'Você precisa manter ao menos um funil.' });
    }

    const funil = await Funil.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!funil) return res.status(404).json({ error: 'Funil não encontrado.' });

    const colunas = await Column.find({ userId: req.userId, funilId: funil._id });
    const colunaIds = colunas.map((c) => c._id);
    await Card.deleteMany({ userId: req.userId, columnId: { $in: colunaIds } });
    await Column.deleteMany({ userId: req.userId, funilId: funil._id });

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir funil.' });
  }
});

// POST /api/funis/:id/duplicar -> cria um funil novo com a mesma estrutura de colunas
// (nome, tipo, ordem, probabilidade) do funil de origem — sem duplicar os clientes
router.post('/:id/duplicar', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const original = await Funil.findOne({ _id: req.params.id, userId: req.userId });
    if (!original) return res.status(404).json({ error: 'Funil não encontrado.' });

    const total = await Funil.countDocuments({ userId: req.userId });
    const novoFunil = await Funil.create({ userId: req.userId, nome: `${original.nome} (cópia)`, ordem: total });

    const colunasOriginais = await Column.find({ userId: req.userId, funilId: original._id }).sort({ ordem: 1 });
    if (colunasOriginais.length) {
      await Column.insertMany(
        colunasOriginais.map((c) => ({
          userId: req.userId,
          funilId: novoFunil._id,
          nome: c.nome,
          tipo: c.tipo,
          probabilidade: c.probabilidade,
          ordem: c.ordem,
        }))
      );
    }
    res.status(201).json(novoFunil.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao duplicar funil.' });
  }
});

module.exports = router;
