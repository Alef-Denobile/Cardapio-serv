const express = require('express');
const auth = require('../middleware/auth');
const MetaVendas = require('../models/MetaVendas');

const router = express.Router();
router.use(auth); // todas as rotas de meta exigem login

// GET /api/metas/:mes -> retorna a meta daquele mês (0 se ainda não foi definida)
router.get('/:mes', async (req, res) => {
  try {
    const meta = await MetaVendas.findOne({ userId: req.userId, mes: req.params.mes });
    res.json({ mes: req.params.mes, valorMeta: meta ? meta.valorMeta : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a meta.' });
  }
});

// PUT /api/metas/:mes -> define/atualiza a meta daquele mês
router.put('/:mes', async (req, res) => {
  try {
    const { valorMeta } = req.body;
    if (typeof valorMeta !== 'number' || valorMeta < 0) {
      return res.status(400).json({ error: 'Informe um valor de meta válido.' });
    }
    const meta = await MetaVendas.findOneAndUpdate(
      { userId: req.userId, mes: req.params.mes },
      { valorMeta },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(meta.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a meta.' });
  }
});

module.exports = router;
