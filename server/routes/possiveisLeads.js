const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const PossivelLead = require('../models/PossivelLead');
const Card = require('../models/Card');
const Column = require('../models/Column');
const { gerarComissaoAutomaticaSeGanho } = require('../utils/comissaoAutomatica');

const router = express.Router();
router.use(auth); // todas as rotas de possível lead exigem login

// GET /api/possiveis-leads -> lista os que ainda não foram completados/descartados
router.get('/', async (req, res) => {
  try {
    const leads = await PossivelLead.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ leads: leads.map((l) => l.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os possíveis leads.' });
  }
});

// POST /api/possiveis-leads/importar -> recebe as linhas já lidas da planilha no navegador
router.post('/importar', async (req, res) => {
  try {
    const { linhas, origemArquivo } = req.body;
    if (!Array.isArray(linhas) || !linhas.length) {
      return res.status(400).json({ error: 'Nenhuma linha pra importar.' });
    }
    const documentos = linhas
      .filter((l) => l && (l.nome || l.telefone))
      .slice(0, 2000) // limite de segurança por importação
      .map((l) => ({
        userId: req.userId,
        nome: (l.nome || '').toString().trim(),
        telefone: (l.telefone || '').toString().trim(),
        tipoServico: (l.tipoServico || '').toString().trim(),
        origemArquivo: origemArquivo || '',
      }));
    if (!documentos.length) return res.status(400).json({ error: 'Nenhuma linha válida encontrada.' });
    const criados = await PossivelLead.insertMany(documentos);
    res.status(201).json({ total: criados.length });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao importar a planilha.' });
  }
});

// POST /api/possiveis-leads/:id/promover -> completa os dados e vira um cliente de verdade
router.post('/:id/promover', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const possivel = await PossivelLead.findOne({ _id: req.params.id, userId: req.userId });
    if (!possivel) return res.status(404).json({ error: 'Possível lead não encontrado.' });

    const { nome, telefone, columnId, valor, temperatura, obs, mes } = req.body;
    const nomeFinal = (nome || possivel.nome || '').trim();
    const telefoneFinal = (telefone || possivel.telefone || '').trim();
    if (!nomeFinal) return res.status(400).json({ error: 'Informe o nome do cliente.' });
    if (!columnId || !mongoose.isValidObjectId(columnId)) return res.status(400).json({ error: 'Escolha a coluna de destino.' });
    const coluna = await Column.findOne({ _id: columnId, userId: req.userId });
    if (!coluna) return res.status(404).json({ error: 'Coluna não encontrada.' });

    const card = await Card.create({
      userId: req.userId,
      columnId,
      cliente: nomeFinal,
      telefone: telefoneFinal,
      valor: valor || 0,
      temperatura: temperatura || 'morno',
      obs: obs || '',
      mes: mes || new Date().toISOString().slice(0, 7),
    });
    await PossivelLead.findByIdAndDelete(possivel._id);
    res.status(201).json(card.toJSON());
    gerarComissaoAutomaticaSeGanho(req.userId, card, columnId);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao promover o lead.' });
  }
});

// DELETE /api/possiveis-leads/:id -> descarta (duplicado, contato errado, etc.)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const possivel = await PossivelLead.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!possivel) return res.status(404).json({ error: 'Possível lead não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao descartar o possível lead.' });
  }
});

module.exports = router;
