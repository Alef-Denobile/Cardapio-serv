const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const CampoPersonalizado = require('../models/CampoPersonalizado');

const router = express.Router();
router.use(auth); // todas as rotas de campo personalizado exigem login

// GET /api/campos-personalizados -> lista os campos do usuário
router.get('/', async (req, res) => {
  try {
    const campos = await CampoPersonalizado.find({ userId: req.userId }).sort({ ordem: 1, createdAt: 1 });
    res.json({ campos: campos.map((c) => c.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os campos personalizados.' });
  }
});

// POST /api/campos-personalizados -> cria um campo novo
router.post('/', async (req, res) => {
  try {
    const { nome, tipo } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome do campo é obrigatório.' });
    const tipoFinal = ['texto', 'numero', 'data'].includes(tipo) ? tipo : 'texto';
    const total = await CampoPersonalizado.countDocuments({ userId: req.userId });
    const campo = await CampoPersonalizado.create({ userId: req.userId, nome: nome.trim(), tipo: tipoFinal, ordem: total });
    res.status(201).json(campo.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar o campo personalizado.' });
  }
});

// DELETE /api/campos-personalizados/:id -> exclui a definição do campo
// (os valores já preenchidos nos clientes ficam órfãos, sem aparecer em lugar nenhum — não é apagado dos cards por simplicidade)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const campo = await CampoPersonalizado.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!campo) return res.status(404).json({ error: 'Campo não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir o campo personalizado.' });
  }
});

module.exports = router;
