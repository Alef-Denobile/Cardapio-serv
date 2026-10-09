const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const WebhookSaida = require('../models/WebhookSaida');
const { EVENTOS_DISPONIVEIS } = require('../models/WebhookSaida');

const router = express.Router();
router.use(auth);

// GET /api/webhooks-saida -> lista os webhooks do usuário
router.get('/', async (req, res) => {
  try {
    const webhooks = await WebhookSaida.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ webhooks: webhooks.map((w) => w.toJSON()), eventosDisponiveis: EVENTOS_DISPONIVEIS });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os webhooks.' });
  }
});

// POST /api/webhooks-saida -> cria um novo webhook de saída
router.post('/', async (req, res) => {
  try {
    const { nome, url, eventos } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: 'URL é obrigatória.' });
    if (!Array.isArray(eventos) || !eventos.length) return res.status(400).json({ error: 'Escolha ao menos um evento.' });
    const eventosValidos = eventos.filter((e) => EVENTOS_DISPONIVEIS.includes(e));
    if (!eventosValidos.length) return res.status(400).json({ error: 'Nenhum evento válido selecionado.' });

    const webhook = await WebhookSaida.create({ userId: req.userId, nome: (nome || '').trim(), url: url.trim(), eventos: eventosValidos });
    res.status(201).json(webhook.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar o webhook.' });
  }
});

// PUT /api/webhooks-saida/:id -> edita um webhook (nome, url, eventos, ativo)
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const { nome, url, eventos, ativo } = req.body;
    const updates = {};
    if (typeof nome === 'string') updates.nome = nome.trim();
    if (typeof url === 'string' && url.trim()) updates.url = url.trim();
    if (Array.isArray(eventos)) updates.eventos = eventos.filter((e) => EVENTOS_DISPONIVEIS.includes(e));
    if (typeof ativo === 'boolean') updates.ativo = ativo;

    const webhook = await WebhookSaida.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true, runValidators: true });
    if (!webhook) return res.status(404).json({ error: 'Webhook não encontrado.' });
    res.json(webhook.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar o webhook.' });
  }
});

// DELETE /api/webhooks-saida/:id -> remove um webhook
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const resultado = await WebhookSaida.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!resultado) return res.status(404).json({ error: 'Webhook não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover o webhook.' });
  }
});

// POST /api/webhooks-saida/:id/testar -> dispara um evento de teste, pra você ver na outra ponta
router.post('/:id/testar', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const webhook = await WebhookSaida.findOne({ _id: req.params.id, userId: req.userId });
    if (!webhook) return res.status(404).json({ error: 'Webhook não encontrado.' });

    const resposta = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Painel-Crm-Secret': webhook.secreto },
      body: JSON.stringify({ evento: 'teste', dados: { mensagem: 'Disparo de teste do Painel CRM' }, disparadoEm: new Date().toISOString() }),
    });
    webhook.ultimoEnvioEm = new Date();
    webhook.ultimoEnvioStatus = resposta.ok ? 'ok' : 'erro';
    await webhook.save();
    if (!resposta.ok) return res.status(502).json({ error: `A URL respondeu com status ${resposta.status}.` });
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: 'Não foi possível alcançar essa URL. Confira se está certa e se aceita POST.' });
  }
});

module.exports = router;
