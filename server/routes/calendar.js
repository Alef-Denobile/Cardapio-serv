const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { CLIENT_ID, CLIENT_SECRET, listarEventosPrimario, chamarCalendarApi } = require('../utils/calendarSync');
const { gerarIcs } = require('../utils/icsFeed');
const Task = require('../models/Task');
const EventoGoogleExtra = require('../models/EventoGoogleExtra');

const router = express.Router();
const JWT_SECRET = auth.JWT_SECRET;

function redirectUriDe(req) {
  return `${req.protocol}://${req.get('host')}/api/calendar/callback`;
}
function urlFeedIcsDe(req, token) {
  return `${req.protocol}://${req.get('host')}/api/calendar/ics/${token}.ics`;
}

// GET /api/calendar/status -> diz se o usuário logado já conectou a Google Agenda
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ connected: !!(user && user.googleCalendar && user.googleCalendar.refreshToken) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar a conexão com o Google Agenda.' });
  }
});

// GET /api/calendar/connect-url -> devolve a URL de autorização do Google
router.get('/connect-url', auth, (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'Integração com o Google Agenda não está configurada neste servidor.' });
  }
  const state = jwt.sign({ sub: req.userId }, JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUriDe(req),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar',
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// GET /api/calendar/callback -> o Google redireciona o navegador pra cá após o consentimento
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return res.redirect('/index.html?calendar=erro');

    const payload = jwt.verify(state, JWT_SECRET);
    const userId = payload.sub;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUriDe(req),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      return res.redirect('/index.html?calendar=erro');
    }

    const updates = {
      'googleCalendar.accessToken': tokens.access_token,
      'googleCalendar.expiryDate': Date.now() + tokens.expires_in * 1000,
    };
    // o Google só manda refresh_token na primeira autorização (por isso usamos prompt=consent)
    if (tokens.refresh_token) updates['googleCalendar.refreshToken'] = tokens.refresh_token;

    await User.findByIdAndUpdate(userId, updates);
    res.redirect('/index.html?calendar=conectado');
  } catch (err) {
    res.redirect('/index.html?calendar=erro');
  }
});

// POST /api/calendar/disconnect -> apaga os tokens guardados (não mexe nos eventos já criados)
router.post('/disconnect', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      'googleCalendar.accessToken': null,
      'googleCalendar.refreshToken': null,
      'googleCalendar.expiryDate': null,
      'googleCalendar.calendarId': null,
    });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desconectar do Google Agenda.' });
  }
});

// GET /api/calendar/agenda-mes?mes=YYYY-MM -> tarefas do CRM + eventos do Google
// Agenda (calendário principal do usuário) misturados, pra montar a visão de calendário
router.get('/agenda-mes', auth, async (req, res) => {
  try {
    const mes = req.query.mes; // "YYYY-MM"
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Informe o mês no formato YYYY-MM.' });
    const [ano, mesNum] = mes.split('-').map(Number);
    const inicioMes = new Date(ano, mesNum - 1, 1);
    const fimMes = new Date(ano, mesNum, 0, 23, 59, 59);

    const tarefas = await Task.find({
      userId: req.userId,
      vencimento: { $gte: inicioMes, $lte: fimMes },
    }).select('titulo vencimento prioridade concluida leadId descricao').populate('leadId', 'cliente');

    let eventosGoogle = [];
    const user = await User.findById(req.userId);
    if (user && user.googleCalendar && user.googleCalendar.refreshToken) {
      try {
        eventosGoogle = await listarEventosPrimario(user, inicioMes, fimMes);
        const extras = await EventoGoogleExtra.find({ userId: req.userId, eventId: { $in: eventosGoogle.map((e) => e.id) } }).populate('leadId', 'cliente');
        const extraPorEventId = new Map(extras.map((ex) => [ex.eventId, ex]));
        eventosGoogle = eventosGoogle.map((ev) => {
          const extra = extraPorEventId.get(ev.id);
          return {
            ...ev,
            prioridade: extra ? extra.prioridade : 'media',
            concluida: extra ? !!extra.concluida : false,
            leadId: extra && extra.leadId ? extra.leadId._id.toString() : null,
            clienteNome: extra && extra.leadId ? extra.leadId.cliente : null,
          };
        });
      } catch (e) {
        console.error('Erro ao buscar eventos do Google Agenda:', e.message);
      }
    }

    res.json({
      tarefas: tarefas.map((t) => ({
        id: t._id.toString(),
        titulo: t.titulo,
        vencimento: t.vencimento,
        prioridade: t.prioridade,
        concluida: t.concluida,
        descricao: t.descricao,
        leadId: t.leadId ? t.leadId._id.toString() : null,
        clienteNome: t.leadId ? t.leadId.cliente : null,
      })),
      eventosGoogle,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a agenda do mês.' });
  }
});

// PUT /api/calendar/eventos/:eventId -> edita um evento do Google Agenda principal, direto na fonte
router.put('/eventos/:eventId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.googleCalendar || !user.googleCalendar.refreshToken) {
      return res.status(400).json({ error: 'Google Agenda não está conectado.' });
    }
    const { titulo, data, hora, descricao, prioridade, leadId } = req.body;
    if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Título é obrigatório.' });
    if (!data) return res.status(400).json({ error: 'Data é obrigatória.' });

    // Campos que o Google entende — vão direto pro evento de verdade.
    let corpoEvento;
    if (hora) {
      const inicio = new Date(`${data}T${hora}`);
      if (isNaN(inicio.getTime())) return res.status(400).json({ error: 'Data ou horário inválido.' });
      const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
      corpoEvento = { summary: titulo.trim(), description: descricao || '', start: { dateTime: inicio.toISOString() }, end: { dateTime: fim.toISOString() } };
    } else {
      corpoEvento = { summary: titulo.trim(), description: descricao || '', start: { date: data }, end: { date: data } };
    }
    await chamarCalendarApi(user, `/calendars/primary/events/${req.params.eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(corpoEvento),
    });

    // Campos que só existem no nosso CRM — ficam guardados aqui, amarrados pelo ID do evento.
    await EventoGoogleExtra.findOneAndUpdate(
      { userId: req.userId, eventId: req.params.eventId },
      { prioridade: prioridade || 'media', leadId: leadId || null },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao editar o evento no Google Agenda.' });
  }
});

// DELETE /api/calendar/eventos/:eventId -> remove um evento do Google Agenda principal
// PUT /api/calendar/eventos/:eventId/toggle -> marca/desmarca um evento como concluído — só
// no nosso CRM, não mexe no evento de verdade no Google (Calendar não tem esse conceito)
router.put('/eventos/:eventId/toggle', auth, async (req, res) => {
  try {
    const existente = await EventoGoogleExtra.findOne({ userId: req.userId, eventId: req.params.eventId });
    const extra = await EventoGoogleExtra.findOneAndUpdate(
      { userId: req.userId, eventId: req.params.eventId },
      { concluida: existente ? !existente.concluida : true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(extra.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar o evento.' });
  }
});

router.delete('/eventos/:eventId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.googleCalendar || !user.googleCalendar.refreshToken) {
      return res.status(400).json({ error: 'Google Agenda não está conectado.' });
    }
    await chamarCalendarApi(user, `/calendars/primary/events/${req.params.eventId}`, { method: 'DELETE' });
    await EventoGoogleExtra.deleteOne({ userId: req.userId, eventId: req.params.eventId });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao excluir o evento do Google Agenda.' });
  }
});

/* ---------- link de agenda (.ics) — alternativa que não depende do Google ----------
   Qualquer app de calendário (Google, Apple, Outlook…) consegue "assinar" essa URL e ver
   as tarefas automaticamente, sem precisar conectar conta nenhuma nem configurar nada no
   servidor. Pensado pra quando o painel for usado fora da operação original (ver o botão
   "Regras de comissão" — essa e aquela mudança vieram da mesma conversa sobre deixar o
   sistema independente de integrações específicas). */

// GET /api/calendar/ics-status -> se esse usuário já tem um link de agenda ativo
router.get('/ics-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('icsToken');
    const ativo = !!(user && user.icsToken);
    res.json({ ativo, url: ativo ? urlFeedIcsDe(req, user.icsToken) : null });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar o link de agenda.' });
  }
});

// POST /api/calendar/ics/gerar -> cria (ou substitui) o link secreto do feed de agenda
router.post('/ics/gerar', auth, async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    await User.findByIdAndUpdate(req.userId, { icsToken: token });
    res.json({ ativo: true, url: urlFeedIcsDe(req, token) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar o link de agenda.' });
  }
});

// POST /api/calendar/ics/revogar -> invalida o link atual — apps que já assinaram param
// de conseguir atualizar; pra voltar a usar, precisa gerar um link novo
router.post('/ics/revogar', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { icsToken: null });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao revogar o link de agenda.' });
  }
});

// GET /api/calendar/ics/:token.ics -> feed público (sem login) — o "segredo" é o próprio
// token, longo e aleatório, difícil de adivinhar; é assim que Google/Apple/Outlook também
// fazem esse tipo de link ("assinar por URL")
router.get('/ics/:token', async (req, res) => {
  try {
    const token = req.params.token.replace(/\.ics$/i, '');
    const user = await User.findOne({ icsToken: token }).select('_id nome');
    if (!user) return res.status(404).type('text/plain; charset=utf-8').send('Link de agenda inválido ou revogado.');

    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 6, 0, 23, 59, 59);
    const tarefas = await Task.find({
      userId: user._id,
      vencimento: { $gte: inicio, $lte: fim },
    }).select('titulo vencimento descricao concluida leadId').populate('leadId', 'cliente');

    res.type('text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="agenda-painel-crm.ics"');
    res.send(gerarIcs(tarefas, user.nome ? `Agenda — ${user.nome}` : 'Agenda — Painel CRM'));
  } catch (err) {
    res.status(500).type('text/plain; charset=utf-8').send('Erro ao gerar o feed de agenda.');
  }
});

module.exports = router;
