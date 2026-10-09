const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Message = require('../models/Message');
const { dispararWebhooks } = require('../utils/dispararWebhooks');

const router = express.Router();

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || '';
const GRAPH_API = 'https://graph.facebook.com/v19.0';

// tenta achar o valor de um campo do formulário, testando os nomes mais comuns
function extrairCampo(campos, possiveisNomes) {
  for (const nome of possiveisNomes) {
    if (campos[nome]) return campos[nome];
  }
  return '';
}

/* ===================== rotas públicas (chamadas pela Meta) ===================== */

// GET /api/instagram/webhook -> verificação inicial exigida pela Meta ao cadastrar o webhook
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/instagram/webhook -> a Meta chama aqui tanto pra leads de anúncio quanto
// pra mensagens diretas (DM), dependendo do que veio no corpo da notificação
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responde rápido e sempre 200, senão a Meta reenvia o mesmo evento
  try {
    const entry = (req.body.entry || [])[0];
    if (!entry) return;

    // Mensagens diretas (DM) vêm em "messaging", sem passar por "changes"
    if (entry.messaging && entry.messaging.length) {
      await processarMensagensDiretas(entry);
      return;
    }

    const pageId = entry.id;
    const user = await User.findOne({ 'instagramLeads.pageId': pageId });
    if (!user) return; // página não pertence a nenhuma conta cadastrada aqui

    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen') continue;
      const leadgenId = change.value && change.value.leadgen_id;
      if (!leadgenId) continue;

      const resp = await fetch(`${GRAPH_API}/${leadgenId}?access_token=${user.instagramLeads.pageAccessToken}`);
      const leadData = await resp.json();
      if (!resp.ok) {
        console.error('Erro ao buscar lead do Instagram:', leadData.error && leadData.error.message);
        continue;
      }

      const campos = {};
      (leadData.field_data || []).forEach((f) => {
        campos[f.name] = (f.values && f.values[0]) || '';
      });

      const nome = extrairCampo(campos, ['full_name', 'nome_completo', 'name', 'nome']) || 'Lead do Instagram';
      const telefone = extrairCampo(campos, ['phone_number', 'telefone', 'phone']);
      const email = extrairCampo(campos, ['email', 'e-mail']);

      const coluna = await Column.findOne({ userId: user._id, tipo: 'aberto' }).sort({ ordem: 1 });
      if (!coluna) continue; // usuário não tem nenhuma coluna "em aberto" pra receber o lead

      const novoCard = await Card.create({
        userId: user._id,
        columnId: coluna._id,
        cliente: nome,
        telefone,
        valor: 0,
        temperatura: 'morno',
        obs: `Capturado via anúncio do Instagram/Facebook.${email ? ` E-mail: ${email}` : ''}`,
        mes: new Date().toISOString().slice(0, 7),
      });
      dispararWebhooks(user._id, 'lead.criado', { id: novoCard._id.toString(), cliente: novoCard.cliente, telefone: novoCard.telefone, origem: 'instagram_leadgen' });
    }
  } catch (err) {
    console.error('Erro ao processar webhook do Instagram:', err.message);
  }
});

// Processa mensagens diretas (DM) do Instagram — encontra (ou cria) o cliente pelo
// ID de remetente do Instagram, e salva a mensagem igual já fazemos com o WhatsApp.
async function processarMensagensDiretas(entry) {
  const igBusinessId = entry.id;
  const user = await User.findOne({ $or: [{ 'instagramLeads.igBusinessId': igBusinessId }, { 'instagramLeads.pageId': igBusinessId }] });
  if (!user) return; // conta não pertence a nenhum usuário cadastrado aqui

  for (const evento of entry.messaging || []) {
    if (!evento.message || evento.message.is_echo) continue; // ignora eco de mensagens que nós mesmos enviamos
    const remetenteId = evento.sender && evento.sender.id;
    if (!remetenteId) continue;

    let card = await Card.findOne({ userId: user._id, instagramId: remetenteId });
    if (!card) {
      const coluna = await Column.findOne({ userId: user._id, tipo: 'aberto' }).sort({ ordem: 1 });
      if (!coluna) continue; // usuário não tem nenhuma coluna "em aberto" pra receber o lead

      let nomeContato = 'Novo contato (Instagram)';
      try {
        const perfilResp = await fetch(`${GRAPH_API}/${remetenteId}?fields=name,username&access_token=${user.instagramLeads.pageAccessToken}`);
        const perfil = await perfilResp.json();
        if (perfilResp.ok) nomeContato = perfil.name || (perfil.username ? `@${perfil.username}` : nomeContato);
      } catch (e) { /* segue com o nome genérico se não conseguir buscar o perfil */ }

      card = await Card.create({
        userId: user._id,
        columnId: coluna._id,
        cliente: nomeContato,
        instagramId: remetenteId,
        valor: 0,
        temperatura: 'morno',
        obs: '',
        mes: new Date().toISOString().slice(0, 7),
      });
      dispararWebhooks(user._id, 'lead.criado', { id: card._id.toString(), cliente: card.cliente, origem: 'instagram_dm' });
    }

    const texto = evento.message.text || (evento.message.attachments && evento.message.attachments.length ? '📎 Anexo do Instagram' : '[mensagem sem texto]');
    await Message.create({
      userId: user._id,
      cardId: card._id,
      direction: 'in',
      canal: 'instagram',
      texto,
      instagramMessageId: evento.message.mid,
      timestamp: evento.timestamp ? new Date(evento.timestamp) : new Date(),
    });
    dispararWebhooks(user._id, 'mensagem.recebida', { cardId: card._id.toString(), cliente: card.cliente, texto, canal: 'instagram' });
  }
}

// Envia uma mensagem de texto pro Instagram (DM), usando o access token da página conectada
async function enviarMensagemInstagram(user, card, texto) {
  const resp = await fetch(`${GRAPH_API}/me/messages?access_token=${user.instagramLeads.pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: card.instagramId }, message: { text: texto } }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error((data.error && data.error.message) || 'Erro ao enviar mensagem pro Instagram.');
  return data;
}

/* ===================== rotas autenticadas (usadas pelo painel) ===================== */

// GET /api/instagram/status -> diz se o usuário já conectou a captação de leads
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const conectado = !!(
      user &&
      user.instagramLeads &&
      user.instagramLeads.pageAccessToken &&
      user.instagramLeads.pageId
    );
    res.json({ connected: conectado });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar a conexão com o Instagram.' });
  }
});

// POST /api/instagram/configurar -> salva o Page ID e o token de acesso de página gerados no Meta
router.post('/configurar', auth, async (req, res) => {
  try {
    const { pageId, pageAccessToken, igBusinessId } = req.body;
    if (!pageId || !pageAccessToken) {
      return res.status(400).json({ error: 'Preencha o Page ID e o Access Token da página.' });
    }
    await User.findByIdAndUpdate(req.userId, {
      'instagramLeads.pageId': pageId.trim(),
      'instagramLeads.pageAccessToken': pageAccessToken.trim(),
      'instagramLeads.igBusinessId': igBusinessId ? igBusinessId.trim() : null,
    });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a configuração.' });
  }
});

// POST /api/instagram/desconectar
router.post('/desconectar', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      'instagramLeads.pageId': null,
      'instagramLeads.pageAccessToken': null,
    });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desconectar.' });
  }
});

// POST /api/instagram/enviar -> envia uma mensagem de texto pro cliente via DM do Instagram
router.post('/enviar', auth, async (req, res) => {
  try {
    const { cardId, texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Mensagem vazia.' });
    const user = await User.findById(req.userId);
    if (!user.instagramLeads || !user.instagramLeads.pageAccessToken) {
      return res.status(400).json({ error: 'Instagram não conectado.' });
    }
    const card = await Card.findOne({ _id: cardId, userId: req.userId });
    if (!card || !card.instagramId) return res.status(404).json({ error: 'Esse cliente não tem uma conversa de Instagram associada.' });

    const data = await enviarMensagemInstagram(user, card, texto.trim());
    const msg = await Message.create({
      userId: user._id,
      cardId: card._id,
      direction: 'out',
      canal: 'instagram',
      texto: texto.trim(),
      instagramMessageId: data.message_id,
      status: 'sent',
      timestamp: new Date(),
    });
    res.status(201).json(msg.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao enviar a mensagem.' });
  }
});

module.exports = router;
module.exports.enviarMensagemInstagram = enviarMensagemInstagram;
