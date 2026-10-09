const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Message = require('../models/Message');
const Anexo = require('../models/Anexo');
const { dispararWebhooks } = require('../utils/dispararWebhooks');
const { enviarAlertaTelegram } = require('../utils/telegramAlerta');
const { perguntarClaude } = require('../utils/anthropic');
const { gerarComissaoAutomaticaSeGanho } = require('../utils/comissaoAutomatica');

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const GRAPH_API = 'https://graph.facebook.com/v19.0';
const { normalizarTelefone } = require('../utils/telefone');

// Baixa uma mídia recebida pelo WhatsApp (foto, áudio, documento, vídeo) usando o
// mediaId que a Meta manda no webhook, e guarda como Anexo do cliente — igual já
// fazemos com anexos enviados manualmente no card. Nunca lança erro pra fora: se a
// mídia não puder ser baixada, a mensagem de texto (legenda) ainda é salva normalmente.
async function baixarMidiaDoWhatsapp(user, card, mediaId, nomeSugerido) {
  try {
    const metaResp = await fetch(`${GRAPH_API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${user.whatsappBusiness.accessToken}` },
    });
    const meta = await metaResp.json();
    if (!metaResp.ok || !meta.url) return null;

    const arquivoResp = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${user.whatsappBusiness.accessToken}` },
    });
    if (!arquivoResp.ok) return null;
    const buffer = Buffer.from(await arquivoResp.arrayBuffer());
    // limite de ~3MB, igual aos anexos manuais — mídia maior que isso não é salva
    if (buffer.length > 3 * 1024 * 1024) return null;

    const mimeType = meta.mime_type || 'application/octet-stream';
    const dadosBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const anexo = await Anexo.create({
      userId: user._id,
      cardId: card._id,
      nomeArquivo: nomeSugerido || `whatsapp-${mediaId}`,
      tipoMime: mimeType,
      dadosBase64,
      tamanho: buffer.length,
    });
    return anexo;
  } catch (e) {
    console.error('Erro ao baixar mídia do WhatsApp:', e.message);
    return null;
  }
}

// Envia uma mensagem de texto via Graph API e devolve a resposta da Meta.
// Usado tanto pelo envio individual quanto pelo disparo em massa.
async function enviarMensagemGraph(user, card, texto) {
  const resp = await fetch(`${GRAPH_API}/${user.whatsappBusiness.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.whatsappBusiness.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: card.telefoneNormalizado,
      type: 'text',
      text: { body: texto },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data.error && data.error.message) || 'Erro ao enviar mensagem pelo WhatsApp.');
  }
  return data;
}

// Envia um modelo de mensagem já aprovado pela Meta — é o único jeito de escrever
// pra alguém que ainda não te mandou mensagem (fora da janela de 24h de texto livre).
async function enviarTemplateGraph(user, card, nomeTemplate, idioma, variaveis) {
  const components = [];
  if (Array.isArray(variaveis) && variaveis.length) {
    components.push({
      type: 'body',
      parameters: variaveis.map((v) => ({ type: 'text', text: String(v) })),
    });
  }
  const resp = await fetch(`${GRAPH_API}/${user.whatsappBusiness.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.whatsappBusiness.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: card.telefoneNormalizado,
      type: 'template',
      template: {
        name: nomeTemplate,
        language: { code: idioma || 'pt_BR' },
        ...(components.length ? { components } : {}),
      },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data.error && data.error.message) || 'Erro ao enviar o modelo de mensagem.');
  }
  return data;
}

// Gera a resposta do agente a partir do histórico recente da conversa.
async function gerarRespostaAgente(card, mensagensRecentes, novaMensagem) {
  const historico = mensagensRecentes
    .slice(-6)
    .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Você'}: ${m.texto}`)
    .join('\n');
  const prompt = `Você é um assistente de vendas de consórcios no Brasil, respondendo pelo WhatsApp em nome da empresa. Seja cordial, direto, no máximo 3 frases. Não invente informações que você não tem (preços exatos, prazos, condições específicas) — se não souber, diga que um vendedor confirma em breve.

Cliente: ${card.cliente}
Qualificação: ${card.temperatura}

Histórico recente da conversa:
${historico}

Nova mensagem do cliente: "${novaMensagem}"

Responda só com o texto da mensagem, pronto para enviar, sem aspas nem explicações antes ou depois.`;
  return perguntarClaude(prompt, { maxTokens: 250 });
}

// Decide se o agente deve responder e, se sim, gera e envia a mensagem sozinho.
// Gera uma sugestão (mensagem de follow-up + tarefa) a partir da conversa, e guarda
// no card pro humano revisar quando quiser. Nunca envia nada sozinha.
async function gerarSugestaoProativa(user, card) {
  try {
    const mensagens = await Message.find({ cardId: card._id }).sort({ timestamp: 1 }).limit(20);
    const historico = mensagens
      .slice(-8)
      .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Você'}: ${m.texto}`)
      .join('\n');
    const prompt = `Você é um assistente de vendas de consórcios. Com base na conversa abaixo, sugira o próximo passo. Responda em exatamente três linhas, nada além disso:
Linha 1: uma mensagem de follow-up curta, pronta pra enviar, sem aspas
Linha 2: um título curto de tarefa de acompanhamento
Linha 3: só um número — em quantos dias essa tarefa deveria vencer

Cliente: ${card.cliente}
Qualificação: ${card.temperatura}
Conversa recente:
${historico}`;
    const texto = await perguntarClaude(prompt, { maxTokens: 200 });
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    await Card.findByIdAndUpdate(card._id, {
      sugestaoIA: {
        texto: linhas[0] || '',
        tarefaTitulo: linhas[1] || '',
        tarefaDias: parseInt((linhas[2] || '3').replace(/\D/g, ''), 10) || 3,
        geradaEm: new Date(),
      },
    });
  } catch (err) {
    console.error('Erro ao gerar sugestão proativa:', err.message);
  }
}

// Fica em silêncio se um humano respondeu esse cliente nos últimos 30 minutos —
// pra nunca "brigar" com quem está atendendo manualmente.
async function tentarResponderComAgente(user, card) {
  try {
    const ultimaHumana = await Message.findOne({
      cardId: card._id,
      direction: 'out',
      enviadoPorAgente: { $ne: true },
    }).sort({ timestamp: -1 });
    if (ultimaHumana && Date.now() - new Date(ultimaHumana.timestamp).getTime() < 30 * 60 * 1000) {
      return; // um humano assumiu a conversa recentemente
    }

    const mensagens = await Message.find({ cardId: card._id }).sort({ timestamp: 1 }).limit(20);
    const ultimaMsg = mensagens[mensagens.length - 1];
    if (!ultimaMsg || ultimaMsg.direction !== 'in') return;

    const resposta = await gerarRespostaAgente(card, mensagens, ultimaMsg.texto);
    if (!resposta || !resposta.trim()) return;

    const data = await enviarMensagemGraph(user, card, resposta);
    await Message.create({
      userId: user._id,
      cardId: card._id,
      direction: 'out',
      texto: resposta,
      whatsappMessageId: data.messages && data.messages[0] && data.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
      enviadoPorAgente: true,
    });
  } catch (err) {
    console.error('Erro ao gerar resposta do agente de IA:', err.message);
  }
}

/* ===================== rotas públicas (chamadas pela Meta) ===================== */

// GET /api/whatsapp/webhook -> verificação inicial exigida pela Meta ao cadastrar o webhook
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/whatsapp/webhook -> a Meta chama aqui a cada mensagem recebida (ou status de entrega)
router.post('/webhook', async (req, res) => {
  // responde rápido e sempre 200 — senão a Meta reenvia o mesmo evento várias vezes
  res.sendStatus(200);
  try {
    const entry = (req.body.entry || [])[0];
    for (const change of (entry && entry.changes) || []) {
      const value = change && change.value;
      if (!value) continue;

      if (change.field === 'messages' || !change.field) {
        await processarEventoDeMensagens(value);
      } else if (change.field === 'account_alerts') {
        await processarAlertaDeConta(value);
      } else if (change.field === 'account_update') {
        await processarAtualizacaoDeConta(value);
      } else if (change.field === 'phone_number_quality_update') {
        await processarQualidadeDoNumero(value);
      } else if (change.field === 'message_template_status_update') {
        await processarStatusDeTemplate(value);
      } else if (change.field === 'history') {
        await processarHistoricoImportado(value);
      }
      // outros campos (calls, flows, groups, etc.) chegam mas não são processados —
      // não são relevantes pro uso atual do painel.
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err.message);
  }
});

// field "messages" -> mensagem recebida ou atualização de status de entrega/leitura
// (é a lógica que já existia, só isolada numa função pra caber no loop de vários campos)
async function processarEventoDeMensagens(value) {
  const phoneNumberId = value.metadata && value.metadata.phone_number_id;
  if (!phoneNumberId) return;
  const user = await User.findOne({ 'whatsappBusiness.phoneNumberId': phoneNumberId });
  if (!user) return; // número não pertence a nenhuma conta cadastrada aqui

  for (const msg of value.messages || []) {
    const telefone = normalizarTelefone(msg.from);
    let card = await Card.findOne({ userId: user._id, telefoneNormalizado: telefone });
    let eraContatoNovo = false;

    if (!card) {
      // mensagem de um número que ainda não existe no funil — cria um lead novo automaticamente
      const coluna = await Column.findOne({ userId: user._id, tipo: 'aberto' }).sort({ ordem: 1 });
      if (!coluna) continue; // usuário não tem nenhuma coluna "em aberto" pra receber o lead
      const nomeContato =
        (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) ||
        'Novo contato (WhatsApp)';
      card = await Card.create({
        userId: user._id,
        columnId: coluna._id,
        cliente: nomeContato,
        telefone: msg.from,
        valor: 0,
        temperatura: 'morno',
        obs: '',
        mes: new Date().toISOString().slice(0, 7),
      });
      eraContatoNovo = true;
    }

    // Detecta o tipo de mensagem — texto normal, ou algum tipo de mídia (foto,
    // áudio, documento, vídeo). Mídia é baixada e guardada como anexo do cliente.
    const TIPOS_MIDIA = { image: 'image', audio: 'audio', document: 'document', video: 'video' };
    let texto = '[mensagem em formato não suportado]';
    let anexoId = null;
    let midiaTipo = null;
    if (msg.text) {
      texto = msg.text.body;
    } else if (msg.type && TIPOS_MIDIA[msg.type] && msg[msg.type] && msg[msg.type].id) {
      midiaTipo = TIPOS_MIDIA[msg.type];
      const legendas = { image: '📷 Foto', audio: '🎤 Áudio', document: '📄 Documento', video: '🎥 Vídeo' };
      texto = msg[msg.type].caption || legendas[midiaTipo];
      const anexo = await baixarMidiaDoWhatsapp(user, card, msg[msg.type].id, msg[msg.type].filename);
      if (anexo) anexoId = anexo._id;
    }
    await Message.create({
      userId: user._id,
      cardId: card._id,
      direction: 'in',
      texto,
      anexoId,
      midiaTipo,
      whatsappMessageId: msg.id,
      timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date(),
    });
    dispararWebhooks(user._id, 'mensagem.recebida', { cardId: card._id.toString(), cliente: card.cliente, telefone: card.telefone, texto, midiaTipo });

    let tratadoPeloMenu = false;

    // contato novo + menu de triagem ativo -> manda o menu e espera a resposta
    if (eraContatoNovo && user.menuTriagem && user.menuTriagem.ativo && user.menuTriagem.mensagemInicial) {
      try {
        await enviarMensagemGraph(user, card, user.menuTriagem.mensagemInicial);
        await Message.create({
          userId: user._id, cardId: card._id, direction: 'out',
          texto: user.menuTriagem.mensagemInicial, status: 'sent', timestamp: new Date(), enviadoPorAgente: true,
        });
        await Card.findByIdAndUpdate(card._id, { aguardandoMenuTriagem: true });
        tratadoPeloMenu = true;
      } catch (e) {
        console.error('Erro ao enviar menu de triagem:', e.message);
      }
    } else if (card.aguardandoMenuTriagem) {
      // já mandamos o menu antes — confere se a resposta bate com alguma opção
      const escolha = (texto || '').trim();
      const opcao = (user.menuTriagem.opcoes || []).find((o) => o.numero === escolha);
      if (opcao) {
        await Card.findByIdAndUpdate(card._id, { columnId: opcao.colunaDestinoId, aguardandoMenuTriagem: false });
        gerarComissaoAutomaticaSeGanho(user._id, card, opcao.colunaDestinoId);
        if (opcao.respostaConfirmacao) {
          try {
            await enviarMensagemGraph(user, card, opcao.respostaConfirmacao);
            await Message.create({
              userId: user._id, cardId: card._id, direction: 'out',
              texto: opcao.respostaConfirmacao, status: 'sent', timestamp: new Date(), enviadoPorAgente: true,
            });
          } catch (e) {
            console.error('Erro ao enviar confirmação do menu:', e.message);
          }
        }
        tratadoPeloMenu = true;
      } else {
        await Card.findByIdAndUpdate(card._id, { aguardandoMenuTriagem: false }); // resposta não bateu — segue o fluxo normal
      }
    }

    if (!tratadoPeloMenu && user.whatsappBusiness.agenteIaAtivo) {
      await tentarResponderComAgente(user, card);
    }
    if (!tratadoPeloMenu && user.whatsappBusiness.iaProativaAtiva) {
      gerarSugestaoProativa(user, card); // roda em segundo plano, não precisa esperar
    }
  }

  // atualizações de status (entregue/lido) das mensagens que nós mandamos
  for (const status of value.statuses || []) {
    await Message.updateOne({ whatsappMessageId: status.id }, { status: status.status });
  }
}

// field "account_alerts" -> avisos da Meta sobre a conta (incluindo riscos de restrição)
async function processarAlertaDeConta(value) {
  const descricao = value.alert_description || value.alert_type || JSON.stringify(value);
  await enviarAlertaTelegram(`⚠️ Alerta da Meta sobre sua conta do WhatsApp:\n${descricao}`);
}

// field "account_update" -> mudança de status da conta (ex: banida, restrita, reativada)
async function processarAtualizacaoDeConta(value) {
  const evento = value.event || 'status alterado';
  const banInfo = value.ban_info ? ` (motivo: ${value.ban_info.waba_ban_reason || value.ban_info.reason || 'não especificado'})` : '';
  await enviarAlertaTelegram(`⚠️ Status da sua conta do WhatsApp mudou: ${evento}${banInfo}`);
}

// field "phone_number_quality_update" -> mudança na nota de qualidade do número
// (aviso importante — cai antes do número ser bloqueado de vez)
async function processarQualidadeDoNumero(value) {
  const numero = value.display_phone_number || 'seu número';
  const qualidade = value.current_limit || value.event || JSON.stringify(value);
  await enviarAlertaTelegram(`⚠️ A qualidade do número ${numero} no WhatsApp mudou: ${qualidade}`);
}

// field "message_template_status_update" -> a Meta aprovou, rejeitou ou pausou um modelo
async function processarStatusDeTemplate(value) {
  const nome = value.message_template_name || 'modelo';
  const status = value.event || 'status alterado';
  const motivo = value.reason ? ` (motivo: ${value.reason})` : '';
  await enviarAlertaTelegram(`📋 Modelo de mensagem "${nome}": ${status}${motivo}`);
}

// field "history" -> histórico de mensagens importado durante uma migração de número
// pro Business API (só acontece durante o processo de migração, quando configurado)
async function processarHistoricoImportado(value) {
  const phoneNumberId = value.metadata && value.metadata.phone_number_id;
  if (!phoneNumberId) return;
  const user = await User.findOne({ 'whatsappBusiness.phoneNumberId': phoneNumberId });
  if (!user) return;

  for (const historia of value.history || []) {
    for (const thread of historia.threads || []) {
      const telefone = normalizarTelefone(thread.id);
      let card = await Card.findOne({ userId: user._id, telefoneNormalizado: telefone });
      if (!card) continue; // histórico de gente que não está no funil — ignora, não cria lead retroativo

      for (const msg of thread.messages || []) {
        const jaExiste = await Message.findOne({ whatsappMessageId: msg.id });
        if (jaExiste) continue;
        await Message.create({
          userId: user._id,
          cardId: card._id,
          direction: msg.from === thread.id ? 'in' : 'out',
          texto: (msg.text && msg.text.body) || '[mensagem antiga em formato não suportado]',
          whatsappMessageId: msg.id,
          timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date(),
        });
      }
    }
  }
}

/* ===================== rotas autenticadas (usadas pelo painel) ===================== */

// GET /api/whatsapp/status -> diz se o usuário já configurou o WhatsApp Business
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const conectado = !!(
      user &&
      user.whatsappBusiness &&
      user.whatsappBusiness.accessToken &&
      user.whatsappBusiness.phoneNumberId
    );
    const agenteIaAtivo = !!(user && user.whatsappBusiness && user.whatsappBusiness.agenteIaAtivo);
    const iaProativaAtiva = !!(user && user.whatsappBusiness && user.whatsappBusiness.iaProativaAtiva);
    res.json({ connected: conectado, agenteIaAtivo, iaProativaAtiva });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar a conexão com o WhatsApp.' });
  }
});

// POST /api/whatsapp/ia-proativa -> liga/desliga a IA que só sugere no card (nunca envia nada)
router.post('/ia-proativa', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'Conecte o WhatsApp Business antes de ativar a IA proativa.' });
    }
    await User.findByIdAndUpdate(req.userId, { 'whatsappBusiness.iaProativaAtiva': !!req.body.ativo });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar a IA proativa.' });
  }
});

// GET /api/whatsapp/menu-triagem -> configuração atual do menu de triagem de primeiro contato
router.get('/menu-triagem', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ menuTriagem: (user && user.toJSON().menuTriagem) || { ativo: false, mensagemInicial: '', opcoes: [] } });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o menu de triagem.' });
  }
});

// PUT /api/whatsapp/menu-triagem -> salva a configuração do menu de triagem
router.put('/menu-triagem', auth, async (req, res) => {
  try {
    const { ativo, mensagemInicial, opcoes } = req.body;
    if (ativo) {
      if (!mensagemInicial || !mensagemInicial.trim()) {
        return res.status(400).json({ error: 'Escreva a mensagem inicial do menu.' });
      }
      if (!Array.isArray(opcoes) || !opcoes.length) {
        return res.status(400).json({ error: 'Adicione ao menos uma opção.' });
      }
      for (const op of opcoes) {
        if (!op.numero || !op.colunaDestinoId || !mongoose.isValidObjectId(op.colunaDestinoId)) {
          return res.status(400).json({ error: 'Cada opção precisa de um número e uma coluna de destino válida.' });
        }
      }
    }
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        'menuTriagem.ativo': !!ativo,
        'menuTriagem.mensagemInicial': mensagemInicial || '',
        'menuTriagem.opcoes': Array.isArray(opcoes) ? opcoes : [],
      },
      { new: true, runValidators: true }
    );
    res.json({ menuTriagem: user.toJSON().menuTriagem });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao salvar o menu de triagem.' });
  }
});

// POST /api/whatsapp/agente-ia -> liga/desliga o agente que responde clientes sozinho
router.post('/agente-ia', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'Conecte o WhatsApp Business antes de ativar o agente.' });
    }
    await User.findByIdAndUpdate(req.userId, { 'whatsappBusiness.agenteIaAtivo': !!req.body.ativo });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar o agente de IA.' });
  }
});

// POST /api/whatsapp/configurar -> salva o Phone Number ID e o Access Token gerados no Meta
router.post('/configurar', auth, async (req, res) => {
  try {
    const { phoneNumberId, accessToken, wabaId } = req.body;
    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({ error: 'Preencha o Phone Number ID e o Access Token.' });
    }
    await User.findByIdAndUpdate(req.userId, {
      'whatsappBusiness.phoneNumberId': phoneNumberId.trim(),
      'whatsappBusiness.accessToken': accessToken.trim(),
      'whatsappBusiness.wabaId': (wabaId || '').trim() || null,
    });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a configuração.' });
  }
});

// POST /api/whatsapp/desconectar
router.post('/desconectar', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      'whatsappBusiness.phoneNumberId': null,
      'whatsappBusiness.accessToken': null,
      'whatsappBusiness.wabaId': null,
    });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desconectar.' });
  }
});

// GET /api/whatsapp/conversas -> lista todas as conversas, ordenadas pela mensagem mais recente
// (rota mais específica antes da /conversas/:cardId, senão o Express tentaria casar "conversas" como :cardId)
router.get('/conversas', auth, async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.userId);
    const agregadas = await Message.aggregate([
      { $match: { userId: userObjectId } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$cardId',
          ultimaMensagem: { $first: '$texto' },
          ultimaMensagemEm: { $first: '$timestamp' },
          direcaoUltima: { $first: '$direction' },
          canalUltima: { $first: '$canal' },
        },
      },
    ]);

    const cardIds = agregadas.map((a) => a._id);
    const cards = await Card.find({ _id: { $in: cardIds }, userId: req.userId });
    const cardMap = new Map(cards.map((c) => [c._id.toString(), c]));

    const conversas = agregadas
      .map((a) => {
        const card = cardMap.get(a._id.toString());
        if (!card) return null;
        return {
          card: { id: card._id.toString(), cliente: card.cliente, telefone: card.telefone, instagramId: card.instagramId || null },
          ultimaMensagem: a.ultimaMensagem,
          ultimaMensagemEm: a.ultimaMensagemEm,
          direcaoUltima: a.direcaoUltima,
          canal: a.canalUltima || 'whatsapp',
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.ultimaMensagemEm) - new Date(a.ultimaMensagemEm));

    res.json({ conversas });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar as conversas.' });
  }
});

// GET /api/whatsapp/conversas/:cardId -> histórico de mensagens de um cliente
router.get('/conversas/:cardId', auth, async (req, res) => {
  try {
    const card = await Card.findOne({ _id: req.params.cardId, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const mensagens = await Message.find({ userId: req.userId, cardId: card._id }).sort({ timestamp: 1 });

    const anexoIds = mensagens.filter((m) => m.anexoId).map((m) => m.anexoId);
    const anexos = anexoIds.length ? await Anexo.find({ _id: { $in: anexoIds } }) : [];
    const anexoMap = new Map(anexos.map((a) => [a._id.toString(), a.toJSON()]));

    res.json({
      mensagens: mensagens.map((m) => {
        const json = m.toJSON();
        if (json.anexoId && anexoMap.has(json.anexoId)) json.anexo = anexoMap.get(json.anexoId);
        return json;
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a conversa.' });
  }
});

// POST /api/whatsapp/enviar -> envia uma mensagem de texto pro cliente
router.post('/enviar', auth, async (req, res) => {
  try {
    const { cardId, texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Mensagem vazia.' });

    const user = await User.findById(req.userId);
    const card = await Card.findOne({ _id: cardId, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Descobre por qual canal responder: se a última mensagem trocada com esse
    // cliente foi pelo Instagram, responde por lá; senão, WhatsApp (padrão de sempre).
    const ultimaMsg = await Message.findOne({ cardId: card._id }).sort({ timestamp: -1 });
    const usarInstagram = (ultimaMsg && ultimaMsg.canal === 'instagram') || (!card.telefoneNormalizado && card.instagramId);

    if (usarInstagram) {
      if (!user.instagramLeads || !user.instagramLeads.pageAccessToken) {
        return res.status(400).json({ error: 'Instagram não está conectado.' });
      }
      if (!card.instagramId) return res.status(400).json({ error: 'Esse cliente não tem uma conversa de Instagram associada.' });
      const { enviarMensagemInstagram } = require('./instagram');
      const data = await enviarMensagemInstagram(user, card, texto.trim());
      const msg = await Message.create({
        userId: req.userId,
        cardId: card._id,
        direction: 'out',
        canal: 'instagram',
        texto: texto.trim(),
        instagramMessageId: data.message_id,
        status: 'sent',
        timestamp: new Date(),
      });
      return res.status(201).json(msg.toJSON());
    }

    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'WhatsApp Business não está conectado.' });
    }
    if (!card.telefoneNormalizado) return res.status(400).json({ error: 'Esse cliente não tem telefone cadastrado.' });

    const data = await enviarMensagemGraph(user, card, texto);

    const msg = await Message.create({
      userId: req.userId,
      cardId: card._id,
      direction: 'out',
      canal: 'whatsapp',
      texto,
      whatsappMessageId: data.messages && data.messages[0] && data.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    });
    res.status(201).json(msg.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao enviar mensagem.' });
  }
});

// GET /api/whatsapp/templates -> lista os modelos de mensagem já aprovados pela Meta
router.get('/templates', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'WhatsApp Business não está conectado.' });
    }
    if (!user.whatsappBusiness.wabaId) {
      return res.status(400).json({ error: 'Cadastre o WABA ID em Configurações pra listar os modelos automaticamente.' });
    }
    const resp = await fetch(`${GRAPH_API}/${user.whatsappBusiness.wabaId}/message_templates?fields=name,status,language,category&limit=100`, {
      headers: { Authorization: `Bearer ${user.whatsappBusiness.accessToken}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error((data.error && data.error.message) || 'Erro ao buscar os modelos.');
    const templates = (data.data || []).map((t) => ({
      nome: t.name,
      idioma: t.language,
      status: t.status,
      categoria: t.category,
    }));
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao buscar os modelos de mensagem.' });
  }
});

// POST /api/whatsapp/templates -> cria um novo template e manda pra aprovação da Meta
router.post('/templates', auth, async (req, res) => {
  try {
    const { nome, categoria, idioma, texto } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do template.' });
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Informe o texto da mensagem.' });
    const categoriasValidas = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
    const categoriaFinal = categoriasValidas.includes(categoria) ? categoria : 'MARKETING';
    const nomeFinal = nome.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const user = await User.findById(req.userId);
    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'WhatsApp Business não está conectado.' });
    }
    if (!user.whatsappBusiness.wabaId) {
      return res.status(400).json({ error: 'Cadastre o WABA ID em Configurações antes de criar templates.' });
    }

    const resp = await fetch(`${GRAPH_API}/${user.whatsappBusiness.wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.whatsappBusiness.accessToken}`,
      },
      body: JSON.stringify({
        name: nomeFinal,
        language: idioma || 'pt_BR',
        category: categoriaFinal,
        components: [{ type: 'BODY', text: texto }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error((data.error && data.error.message) || 'Erro ao criar o template na Meta.');

    res.status(201).json({ nome: nomeFinal, status: 'PENDING' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao criar o template.' });
  }
});

// POST /api/whatsapp/enviar-template -> envia um modelo aprovado pra um cliente (funciona mesmo fora da janela de 24h)
router.post('/enviar-template', auth, async (req, res) => {
  try {
    const { cardId, templateName, idioma, variaveis } = req.body;
    if (!templateName) return res.status(400).json({ error: 'Informe o nome do modelo.' });

    const user = await User.findById(req.userId);
    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'WhatsApp Business não está conectado.' });
    }
    const card = await Card.findOne({ _id: cardId, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    if (!card.telefoneNormalizado) return res.status(400).json({ error: 'Esse cliente não tem telefone cadastrado.' });

    const data = await enviarTemplateGraph(user, card, templateName, idioma, variaveis);

    const msg = await Message.create({
      userId: req.userId,
      cardId: card._id,
      direction: 'out',
      texto: `[modelo: ${templateName}]`,
      whatsappMessageId: data.messages && data.messages[0] && data.messages[0].id,
      status: 'sent',
      timestamp: new Date(),
    });
    res.status(201).json(msg.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao enviar o modelo de mensagem.' });
  }
});

// POST /api/whatsapp/disparo -> envia a mesma mensagem pra vários clientes de uma vez
router.post('/disparo', auth, async (req, res) => {
  try {
    const { cardIds, texto, usarTemplate, templateName, idioma, variaveis } = req.body;
    if (!Array.isArray(cardIds) || !cardIds.length) {
      return res.status(400).json({ error: 'Selecione ao menos um lead.' });
    }
    if (usarTemplate) {
      if (!templateName) return res.status(400).json({ error: 'Informe o nome do modelo.' });
    } else if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const user = await User.findById(req.userId);
    if (!user || !user.whatsappBusiness || !user.whatsappBusiness.accessToken) {
      return res.status(400).json({ error: 'WhatsApp Business não está conectado.' });
    }

    let sucesso = 0;
    let falha = 0;
    const detalhesFalha = [];
    for (const cardId of cardIds) {
      try {
        const card = await Card.findOne({ _id: cardId, userId: req.userId });
        if (!card || !card.telefoneNormalizado) {
          falha++;
          detalhesFalha.push({ cliente: card ? card.cliente : cardId, erro: 'Cliente sem telefone cadastrado.' });
          continue;
        }
        const data = usarTemplate
          ? await enviarTemplateGraph(user, card, templateName, idioma, variaveis)
          : await enviarMensagemGraph(user, card, texto);
        await Message.create({
          userId: req.userId,
          cardId: card._id,
          direction: 'out',
          texto: usarTemplate ? `[modelo: ${templateName}]` : texto,
          whatsappMessageId: data.messages && data.messages[0] && data.messages[0].id,
          status: 'sent',
          timestamp: new Date(),
        });
        sucesso++;
      } catch (e) {
        falha++;
        const card = await Card.findOne({ _id: cardId, userId: req.userId }).select('cliente');
        detalhesFalha.push({ cliente: card ? card.cliente : cardId, erro: e.message || 'Erro desconhecido.' });
      }
    }
    res.json({ sucesso, falha, detalhesFalha });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao disparar mensagens.' });
  }
});

module.exports = router;
