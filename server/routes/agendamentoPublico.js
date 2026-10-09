const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const Card = require('../models/Card');
const { listarEventosPrimario, sincronizarTarefaComCalendar } = require('../utils/calendarSync');
const { dispararWebhooks } = require('../utils/dispararWebhooks');

const router = express.Router();
// Nenhuma rota aqui exige login — é a página que o CLIENTE (de fora) acessa pra marcar um horário.

// Mesma lógica usada no front-end pra saber se uma tarefa tem horário definido: tarefa
// sem hora é salva como meia-noite UTC, então checa em UTC, não em hora local.
function horaLocalDaTarefa(vencimentoIso) {
  const d = new Date(vencimentoIso);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return { hora: d.getHours(), minuto: d.getMinutes() };
}

function gerarSlotsDoDia(config, dataISO) {
  const dia = new Date(dataISO + 'T00:00:00');
  if (isNaN(dia.getTime())) return [];
  if (!config.diasSemana.includes(dia.getDay())) return [];

  const [hIni, mIni] = config.horaInicio.split(':').map(Number);
  const [hFim, mFim] = config.horaFim.split(':').map(Number);
  const inicioMin = hIni * 60 + mIni;
  const fimMin = hFim * 60 + mFim;
  const slots = [];
  for (let m = inicioMin; m + config.duracaoMinutos <= fimMin; m += config.duracaoMinutos) {
    slots.push({ hora: Math.floor(m / 60), minuto: m % 60 });
  }
  return slots;
}

// GET /api/agendamento-publico/:userId/config -> dados públicos (nome, se está ativo)
router.get('/:userId/config', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ error: 'Link inválido.' });
    const user = await User.findById(req.params.userId).select('nome agendamentoPublico');
    if (!user || !user.agendamentoPublico || !user.agendamentoPublico.ativo) {
      return res.status(404).json({ error: 'Esse link de agendamento não está disponível no momento.' });
    }
    res.json({ nome: user.nome, duracaoMinutos: user.agendamentoPublico.duracaoMinutos });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o agendamento.' });
  }
});

// GET /api/agendamento-publico/:userId/disponibilidade?data=YYYY-MM-DD -> horários livres naquele dia
router.get('/:userId/disponibilidade', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ error: 'Link inválido.' });
    const { data } = req.query;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Data inválida.' });

    const user = await User.findById(req.params.userId);
    if (!user || !user.agendamentoPublico || !user.agendamentoPublico.ativo) {
      return res.status(404).json({ error: 'Esse link de agendamento não está disponível no momento.' });
    }

    const todosSlots = gerarSlotsDoDia(user.agendamentoPublico, data);
    if (!todosSlots.length) return res.json({ slots: [] });

    // remove horários que já passaram, se for hoje
    const agora = new Date();
    const ehHoje = data === `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

    // tarefas já marcadas naquele dia, pra saber quais horários já estão ocupados
    const inicioDia = new Date(data + 'T00:00:00');
    const fimDia = new Date(data + 'T23:59:59');
    const tarefasDoDia = await Task.find({ userId: user._id, vencimento: { $gte: inicioDia, $lte: fimDia } });
    const ocupados = new Set();
    tarefasDoDia.forEach((t) => {
      const h = horaLocalDaTarefa(t.vencimento);
      if (h) ocupados.add(`${h.hora}:${h.minuto}`);
    });

    // eventos do Google Agenda principal, se conectado (evita marcar em cima de um compromisso pessoal)
    if (user.googleCalendar && user.googleCalendar.refreshToken) {
      try {
        const eventos = await listarEventosPrimario(user, inicioDia, fimDia);
        eventos.forEach((ev) => {
          if (ev.diaInteiro || !ev.inicio) return;
          const d = new Date(ev.inicio);
          ocupados.add(`${d.getHours()}:${d.getMinutes()}`);
        });
      } catch (e) {
        // se o Google falhar, segue só com as tarefas — melhor mostrar algo do que travar tudo
      }
    }

    const disponiveis = todosSlots.filter((s) => {
      if (ocupados.has(`${s.hora}:${s.minuto}`)) return false;
      if (ehHoje && (s.hora < agora.getHours() || (s.hora === agora.getHours() && s.minuto <= agora.getMinutes()))) return false;
      return true;
    });

    res.json({ slots: disponiveis.map((s) => `${String(s.hora).padStart(2, '0')}:${String(s.minuto).padStart(2, '0')}`) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os horários disponíveis.' });
  }
});

// POST /api/agendamento-publico/:userId/reservar -> confirma o agendamento
router.post('/:userId/reservar', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ error: 'Link inválido.' });
    const { data, hora, nome, telefone, motivo } = req.body;
    if (!data || !hora || !nome || !nome.trim()) {
      return res.status(400).json({ error: 'Preencha nome, data e horário.' });
    }
    const user = await User.findById(req.params.userId);
    if (!user || !user.agendamentoPublico || !user.agendamentoPublico.ativo) {
      return res.status(404).json({ error: 'Esse link de agendamento não está disponível no momento.' });
    }

    // procura (ou cria) um cliente com esse telefone, pra já entrar no funil
    let card = null;
    if (telefone && telefone.trim()) {
      const { normalizarTelefone } = require('../utils/telefone');
      const telNormalizado = normalizarTelefone(telefone);
      card = await Card.findOne({ userId: user._id, telefoneNormalizado: telNormalizado });
      if (!card) {
        const colunaDestino = user.agendamentoPublico.colunaDestinoId;
        if (colunaDestino) {
          card = await Card.create({ userId: user._id, cliente: nome.trim(), telefone: telefone.trim(), columnId: colunaDestino });
        }
      }
    }

    const vencimento = new Date(`${data}T${hora}`);
    if (isNaN(vencimento.getTime())) return res.status(400).json({ error: 'Data ou horário inválido.' });

    const task = await Task.create({
      userId: user._id,
      titulo: `Reunião com ${nome.trim()}`,
      vencimento: vencimento.toISOString(),
      prioridade: 'alta',
      leadId: card ? card._id : null,
      descricao: motivo ? `Agendado pelo cliente. Motivo: ${motivo.trim()}` : 'Agendado pelo cliente através do link público.',
    });

    dispararWebhooks(user._id, 'tarefa.criada', { id: task._id.toString(), titulo: task.titulo, vencimento: task.vencimento, origem: 'agendamento_publico' });
    sincronizarTarefaComCalendar(user._id, task);

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao confirmar o agendamento. Tente de novo.' });
  }
});

module.exports = router;
