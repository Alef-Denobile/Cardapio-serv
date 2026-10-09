const User = require('../models/User');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const NOME_CALENDARIO = 'Painel do Consórcio — Tarefas';

// Troca o refresh token por um access token novo (o access token expira em ~1h)
async function renovarAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Falha ao renovar o token do Google.');
  return res.json(); // { access_token, expires_in, ... }
}

// Devolve um access token válido para o usuário, renovando se necessário.
// Retorna null se o usuário nunca conectou a Google Agenda.
async function getValidAccessToken(user) {
  const gc = user.googleCalendar;
  if (!gc || !gc.refreshToken) return null;

  const agora = Date.now();
  if (gc.accessToken && gc.expiryDate && gc.expiryDate - 60000 > agora) {
    return gc.accessToken;
  }

  const dados = await renovarAccessToken(gc.refreshToken);
  const novoExpiry = Date.now() + dados.expires_in * 1000;
  await User.findByIdAndUpdate(user._id, {
    'googleCalendar.accessToken': dados.access_token,
    'googleCalendar.expiryDate': novoExpiry,
  });
  return dados.access_token;
}

// Chamada genérica à API do Google Calendar autenticada com o token do usuário
async function chamarCalendarApi(user, path, options = {}) {
  const accessToken = await getValidAccessToken(user);
  if (!accessToken) return null;

  const res = await fetch(CALENDAR_API + path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Erro na API do Google Agenda.');
  return data;
}

// Garante que existe um calendário dedicado ("Painel do Consórcio — Tarefas")
// e devolve o id dele, guardando em cache no próprio usuário.
async function getOrCreateCalendarId(user) {
  if (user.googleCalendar.calendarId) return user.googleCalendar.calendarId;

  const lista = await chamarCalendarApi(user, '/users/me/calendarList');
  const existente = (lista.items || []).find((c) => c.summary === NOME_CALENDARIO);

  let calendarId;
  if (existente) {
    calendarId = existente.id;
  } else {
    const criado = await chamarCalendarApi(user, '/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary: NOME_CALENDARIO }),
    });
    calendarId = criado.id;
  }
  await User.findByIdAndUpdate(user._id, { 'googleCalendar.calendarId': calendarId });
  return calendarId;
}

// Lista os eventos do calendário PRINCIPAL do usuário (o de verdade, onde ele já
// cria reuniões direto no Google Agenda) — diferente do nosso calendário próprio,
// que só guarda as tarefas sincronizadas. Usado pra montar a visão de Agenda.
async function listarEventosPrimario(user, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await chamarCalendarApi(user, `/calendars/primary/events?${params.toString()}`);
  if (!data || !data.items) return [];
  return data.items
    .filter((ev) => ev.status !== 'cancelled')
    .map((ev) => ({
      id: ev.id,
      titulo: ev.summary || '(sem título)',
      descricao: ev.description || '',
      inicio: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
      diaInteiro: !!(ev.start && ev.start.date && !ev.start.dateTime),
    }));
}

// Empurra uma tarefa (criação/edição) pra Google Agenda, se o usuário tiver conectado.
// Nunca deixa um erro aqui quebrar a resposta principal de quem chamou.
async function sincronizarTarefaComCalendar(userId, task) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.googleCalendar || !user.googleCalendar.refreshToken) return;
    const calendarId = await getOrCreateCalendarId(user);

    if (!task.vencimento) {
      if (task.googleEventId) {
        try {
          await chamarCalendarApi(user, `/calendars/${encodeURIComponent(calendarId)}/events/${task.googleEventId}`, { method: 'DELETE' });
        } catch (e) { /* evento já pode ter sido apagado manualmente */ }
        task.googleEventId = null;
        await task.save();
      }
      return;
    }

    // Se a tarefa tem horário definido (não é meia-noite UTC — mesma checagem usada em
    // outras partes do sistema), cria um evento COM horário no Google Agenda, com 1h de
    // duração; senão, mantém o formato antigo de "dia inteiro".
    const dataObj = new Date(task.vencimento);
    const temHora = dataObj.getUTCHours() !== 0 || dataObj.getUTCMinutes() !== 0;
    let corpoEvento;
    if (temHora) {
      const fim = new Date(dataObj.getTime() + 60 * 60 * 1000);
      corpoEvento = {
        summary: task.titulo,
        description: task.descricao || '',
        start: { dateTime: dataObj.toISOString() },
        end: { dateTime: fim.toISOString() },
      };
    } else {
      const dataStr = dataObj.toISOString().slice(0, 10);
      corpoEvento = {
        summary: task.titulo,
        description: task.descricao || '',
        start: { date: dataStr },
        end: { date: dataStr },
      };
    }

    if (task.googleEventId) {
      await chamarCalendarApi(user, `/calendars/${encodeURIComponent(calendarId)}/events/${task.googleEventId}`, {
        method: 'PUT',
        body: JSON.stringify(corpoEvento),
      });
    } else {
      const criado = await chamarCalendarApi(user, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(corpoEvento),
      });
      if (criado && criado.id) {
        task.googleEventId = criado.id;
        await task.save();
      }
    }
  } catch (err) {
    console.error('Erro ao sincronizar tarefa com o Google Agenda:', err.message);
  }
}

module.exports = {
  chamarCalendarApi,
  getOrCreateCalendarId,
  getValidAccessToken,
  listarEventosPrimario,
  sincronizarTarefaComCalendar,
  NOME_CALENDARIO,
  CLIENT_ID,
  CLIENT_SECRET,
};
