const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Fluxo = require('../models/Fluxo');
const FluxoExecucao = require('../models/FluxoExecucao');
const Column = require('../models/Column');

const router = express.Router();
router.use(auth); // todas as rotas de fluxo exigem login

const TIPOS_ETAPA = ['mensagem', 'tarefa', 'mover_coluna'];

function validarEtapas(etapas) {
  if (!Array.isArray(etapas) || !etapas.length) return 'Adicione ao menos uma etapa.';
  for (const etapa of etapas) {
    if (!TIPOS_ETAPA.includes(etapa.tipo)) return 'Tipo de etapa inválido.';
    if (typeof etapa.diasAposInicio !== 'number' || etapa.diasAposInicio < 0) return 'Dias inválidos numa das etapas.';
    if (etapa.tipo === 'mensagem' && (!etapa.params || !etapa.params.texto || !etapa.params.texto.trim())) {
      return 'Preencha o texto da mensagem em todas as etapas de mensagem.';
    }
    if (etapa.tipo === 'mover_coluna' && (!etapa.params || !etapa.params.colunaDestinoId)) {
      return 'Escolha a coluna de destino em todas as etapas de mover coluna.';
    }
  }
  return null;
}

// GET /api/fluxos -> lista os fluxos do usuário, com quantos clientes estão em andamento em cada um
router.get('/', async (req, res) => {
  try {
    const fluxos = await Fluxo.find({ userId: req.userId }).sort({ createdAt: -1 });
    const contagens = await FluxoExecucao.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.userId), concluido: false } },
      { $group: { _id: '$fluxoId', total: { $sum: 1 } } },
    ]);
    const mapaContagem = new Map(contagens.map((c) => [c._id.toString(), c.total]));
    res.json({
      fluxos: fluxos.map((f) => {
        const json = f.toJSON();
        json.emAndamento = mapaContagem.get(f._id.toString()) || 0;
        return json;
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar fluxos.' });
  }
});

// POST /api/fluxos -> cria um novo fluxo
router.post('/', async (req, res) => {
  try {
    const { nome, colunaGatilhoId, etapas } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome do fluxo é obrigatório.' });
    if (!colunaGatilhoId || !mongoose.isValidObjectId(colunaGatilhoId)) {
      return res.status(400).json({ error: 'Coluna de gatilho inválida.' });
    }
    const erroEtapas = validarEtapas(etapas);
    if (erroEtapas) return res.status(400).json({ error: erroEtapas });

    const coluna = await Column.findOne({ _id: colunaGatilhoId, userId: req.userId });
    if (!coluna) return res.status(404).json({ error: 'Coluna de gatilho não encontrada.' });

    const fluxo = await Fluxo.create({
      userId: req.userId,
      nome: nome.trim(),
      colunaGatilhoId,
      etapas: etapas.map((e) => ({ diasAposInicio: e.diasAposInicio, tipo: e.tipo, params: e.params || {} })),
    });
    res.status(201).json(fluxo.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar fluxo.' });
  }
});

// PUT /api/fluxos/:id -> edita nome, coluna de gatilho, etapas ou ativo/inativo
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const updates = {};
    if (typeof req.body.nome === 'string') updates.nome = req.body.nome.trim();
    if (typeof req.body.ativo === 'boolean') updates.ativo = req.body.ativo;
    if (req.body.etapas) {
      const erroEtapas = validarEtapas(req.body.etapas);
      if (erroEtapas) return res.status(400).json({ error: erroEtapas });
      updates.etapas = req.body.etapas.map((e) => ({ diasAposInicio: e.diasAposInicio, tipo: e.tipo, params: e.params || {} }));
    }
    if (req.body.colunaGatilhoId && mongoose.isValidObjectId(req.body.colunaGatilhoId)) {
      const coluna = await Column.findOne({ _id: req.body.colunaGatilhoId, userId: req.userId });
      if (!coluna) return res.status(404).json({ error: 'Coluna de gatilho não encontrada.' });
      updates.colunaGatilhoId = req.body.colunaGatilhoId;
    }

    const fluxo = await Fluxo.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true, runValidators: true });
    if (!fluxo) return res.status(404).json({ error: 'Fluxo não encontrado.' });
    res.json(fluxo.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar fluxo.' });
  }
});

// DELETE /api/fluxos/:id -> exclui o fluxo e as execuções em andamento dele
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const fluxo = await Fluxo.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!fluxo) return res.status(404).json({ error: 'Fluxo não encontrado.' });
    await FluxoExecucao.deleteMany({ fluxoId: fluxo._id });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir fluxo.' });
  }
});

module.exports = router;
