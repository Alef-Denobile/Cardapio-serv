const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const RegraComissao = require('../models/RegraComissao');
const { obterRegrasDoUsuario, gerarChaveUnica } = require('../utils/regrasComissao');

const router = express.Router();
router.use(auth);

// Confere e limpa a lista de blocos vinda do front (a "planilha" de parcelas/percentual).
// Percentual chega em formato "humano" (ex: 1.6 pra 1,6%) e é convertido pra fração.
function validarBlocos(blocosRecebidos) {
  if (!Array.isArray(blocosRecebidos) || blocosRecebidos.length === 0) {
    return { erro: 'A regra precisa ter pelo menos uma linha de parcelas.' };
  }
  const blocos = [];
  for (const b of blocosRecebidos) {
    const parcelas = parseInt(b && b.parcelas, 10);
    const percentualPct = parseFloat(b && b.percentual);
    if (!Number.isFinite(parcelas) || parcelas < 1) {
      return { erro: 'Cada linha precisa de um número de parcelas válido (mínimo 1).' };
    }
    if (!Number.isFinite(percentualPct) || percentualPct < 0) {
      return { erro: 'Cada linha precisa de um percentual válido (0 ou maior).' };
    }
    blocos.push({ parcelas, percentual: percentualPct / 100 });
  }
  return { blocos };
}

// GET /api/regras-comissao -> todas as regras do usuário (cria as padrão se for a 1ª vez)
router.get('/', async (req, res) => {
  try {
    const regras = await obterRegrasDoUsuario(req.userId);
    res.json({ regras: regras.map((r) => (r.toJSON ? r.toJSON() : r)) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar regras de comissão.' });
  }
});

// POST /api/regras-comissao -> cria uma regra nova
router.post('/', async (req, res) => {
  try {
    const { nome, mesIndependente } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Dê um nome pra essa regra de comissão.' });
    }
    const { blocos, erro } = validarBlocos(req.body.blocos);
    if (erro) return res.status(400).json({ error: erro });

    const chave = await gerarChaveUnica(req.userId, nome.trim());
    const ultima = await RegraComissao.findOne({ userId: req.userId }).sort({ ordem: -1 }).select('ordem');
    const regra = await RegraComissao.create({
      userId: req.userId,
      chave,
      nome: nome.trim(),
      blocos,
      mesIndependente: !!mesIndependente,
      padrao: false,
      ordem: ultima ? ultima.ordem + 1 : 0,
    });
    res.status(201).json(regra.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar regra de comissão.' });
  }
});

// PUT /api/regras-comissao/:id -> edita nome/blocos/mesIndependente/ordem (a chave nunca muda,
// pra contratos e leads que já apontam pra ela continuarem funcionando)
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const updates = {};
    if (typeof req.body.nome === 'string') {
      if (!req.body.nome.trim()) return res.status(400).json({ error: 'Dê um nome pra essa regra de comissão.' });
      updates.nome = req.body.nome.trim();
    }
    if (req.body.blocos !== undefined) {
      const { blocos, erro } = validarBlocos(req.body.blocos);
      if (erro) return res.status(400).json({ error: erro });
      updates.blocos = blocos;
    }
    if (typeof req.body.mesIndependente === 'boolean') updates.mesIndependente = req.body.mesIndependente;
    if (Number.isFinite(req.body.ordem)) updates.ordem = req.body.ordem;

    const regra = await RegraComissao.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!regra) return res.status(404).json({ error: 'Regra de comissão não encontrada.' });
    res.json(regra.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar regra de comissão.' });
  }
});

// DELETE /api/regras-comissao/:id -> remove a regra (contratos já gerados guardam o
// cálculo salvo e não são afetados; só passa a não aparecer mais como opção nova)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const regra = await RegraComissao.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!regra) return res.status(404).json({ error: 'Regra de comissão não encontrada.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir regra de comissão.' });
  }
});

module.exports = router;
