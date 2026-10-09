const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Task = require('../models/Task');
const Card = require('../models/Card');
const User = require('../models/User');
const { chamarCalendarApi, getOrCreateCalendarId, sincronizarTarefaComCalendar } = require('../utils/calendarSync');
const { dispararWebhooks } = require('../utils/dispararWebhooks');

const router = express.Router();
router.use(auth); // todas as rotas de tarefa exigem login

const CAMPOS_PERMITIDOS = ['titulo', 'vencimento', 'prioridade', 'leadId', 'descricao'];
function filtrarCampos(body) {
  const dados = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (body[campo] !== undefined) dados[campo] = body[campo] === '' ? null : body[campo];
  }
  return dados;
}

// Remove o evento correspondente na Google Agenda quando a tarefa é excluída no CRM.
async function removerEventoDoCalendar(userId, googleEventId) {
  if (!googleEventId) return;
  try {
    const user = await User.findById(userId);
    if (!user || !user.googleCalendar || !user.googleCalendar.refreshToken) return;
    const calendarId = await getOrCreateCalendarId(user);
    await chamarCalendarApi(user, `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Erro ao remover evento do Google Agenda:', err.message);
  }
}

// GET /api/tasks -> todas as tarefas do usuário logado
router.get('/', async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.userId }).sort({ concluida: 1, vencimento: 1, createdAt: -1 });
    res.json({ tasks: tasks.map((t) => t.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar tarefas.' });
  }
});

// POST /api/tasks -> cria uma nova tarefa
router.post('/', async (req, res) => {
  try {
    const dados = filtrarCampos(req.body);
    if (!dados.titulo || !dados.titulo.trim()) {
      return res.status(400).json({ error: 'Título da tarefa é obrigatório.' });
    }
    if (dados.leadId && !mongoose.isValidObjectId(dados.leadId)) {
      return res.status(400).json({ error: 'Lead relacionado inválido.' });
    }
    if (dados.leadId) {
      const lead = await Card.findOne({ _id: dados.leadId, userId: req.userId });
      if (!lead) return res.status(404).json({ error: 'Lead relacionado não encontrado.' });
    }
    const task = await Task.create({ ...dados, userId: req.userId });
    res.status(201).json(task.toJSON());
    sincronizarTarefaComCalendar(req.userId, task);
    dispararWebhooks(req.userId, 'tarefa.criada', { id: task._id.toString(), titulo: task.titulo, vencimento: task.vencimento, prioridade: task.prioridade });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar tarefa.' });
  }
});

// PUT /api/tasks/:id -> edita uma tarefa
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const dados = filtrarCampos(req.body);
    if (dados.leadId && !mongoose.isValidObjectId(dados.leadId)) {
      return res.status(400).json({ error: 'Lead relacionado inválido.' });
    }
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      dados,
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    res.json(task.toJSON());
    sincronizarTarefaComCalendar(req.userId, task);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
  }
});

// PUT /api/tasks/:id/toggle -> marca/desmarca como concluída
router.put('/:id/toggle', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    task.concluida = !task.concluida;
    await task.save();
    res.json(task.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
  }
});

// DELETE /api/tasks/:id -> remove a tarefa
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    res.status(204).end();
    removerEventoDoCalendar(req.userId, task.googleEventId);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir tarefa.' });
  }
});

// POST /api/tasks/sync-calendar -> puxa da Google Agenda o que mudou de lá pra cá
router.post('/sync-calendar', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.googleCalendar || !user.googleCalendar.refreshToken) {
      return res.status(400).json({ error: 'Google Agenda não conectada.' });
    }
    const calendarId = await getOrCreateCalendarId(user);
    const resultado = await chamarCalendarApi(
      user,
      `/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&maxResults=250`
    );
    const eventos = (resultado && resultado.items) || [];

    const tarefasAtuais = await Task.find({ userId: req.userId });
    const porEventId = new Map(tarefasAtuais.filter((t) => t.googleEventId).map((t) => [t.googleEventId, t]));

    let criadas = 0;
    let atualizadas = 0;

    for (const evento of eventos) {
      if (evento.status === 'cancelled') continue;
      const dataEvento = evento.start && (evento.start.date || (evento.start.dateTime || '').slice(0, 10));
      const existente = porEventId.get(evento.id);

      if (existente) {
        const atualizadoNoGoogle = new Date(evento.updated);
        if (atualizadoNoGoogle > existente.updatedAt) {
          existente.titulo = evento.summary || existente.titulo;
          existente.descricao = evento.description || '';
          existente.vencimento = dataEvento ? new Date(dataEvento) : existente.vencimento;
          await existente.save();
          atualizadas++;
        }
      } else {
        await Task.create({
          userId: req.userId,
          titulo: evento.summary || '(sem título)',
          descricao: evento.description || '',
          vencimento: dataEvento ? new Date(dataEvento) : null,
          prioridade: 'media',
          googleEventId: evento.id,
        });
        criadas++;
      }
    }

    res.json({ criadas, atualizadas });
  } catch (err) {
    console.error('Erro ao sincronizar com o Google Agenda:', err);
    res.status(500).json({ error: err.message || 'Erro ao sincronizar com o Google Agenda.' });
  }
});

module.exports = router;
