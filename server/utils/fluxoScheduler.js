const FluxoExecucao = require('../models/FluxoExecucao');
const Fluxo = require('../models/Fluxo');
const Card = require('../models/Card');
const Task = require('../models/Task');
const Message = require('../models/Message');
const User = require('../models/User');
const { gerarComissaoAutomaticaSeGanho } = require('./comissaoAutomatica');

const GRAPH_API = 'https://graph.facebook.com/v19.0';

async function enviarMensagemGraphSimples(user, card, texto) {
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
  if (!resp.ok) throw new Error((data.error && data.error.message) || 'Erro ao enviar mensagem.');
  return data;
}

// Roda periodicamente (chamado de server.js via setInterval). Pra cada execução de
// fluxo em andamento, confere se já chegou a hora da próxima etapa e, se sim, executa.
async function processarFluxos() {
  try {
    const execucoes = await FluxoExecucao.find({ concluido: false });

    for (const exec of execucoes) {
      try {
        const fluxo = await Fluxo.findById(exec.fluxoId);
        if (!fluxo || !fluxo.ativo) continue;

        const etapa = fluxo.etapas[exec.etapaAtual];
        if (!etapa) {
          exec.concluido = true;
          await exec.save();
          continue;
        }

        const executaEm = exec.iniciadoEm.getTime() + etapa.diasAposInicio * 24 * 60 * 60 * 1000;
        if (Date.now() < executaEm) continue; // ainda não chegou a hora dessa etapa

        const card = await Card.findById(exec.cardId);
        if (!card) {
          exec.concluido = true;
          await exec.save();
          continue;
        }

        if (etapa.tipo === 'tarefa') {
          const diasVenc = Number((etapa.params && etapa.params.diasParaVencimento) || 1);
          const venc = new Date();
          venc.setDate(venc.getDate() + diasVenc);
          await Task.create({
            userId: exec.userId,
            titulo: (etapa.params && etapa.params.titulo) || 'Etapa do fluxo',
            vencimento: venc,
            prioridade: 'media',
            leadId: card._id,
            descricao: `Criada automaticamente pelo fluxo "${fluxo.nome}".`,
          });
        } else if (etapa.tipo === 'mover_coluna') {
          const destino = etapa.params && etapa.params.colunaDestinoId;
          if (destino) {
            const atualizado = await Card.findByIdAndUpdate(card._id, { columnId: destino }, { new: true });
            gerarComissaoAutomaticaSeGanho(exec.userId, atualizado, destino);
          }
        } else if (etapa.tipo === 'mensagem') {
          const texto = (etapa.params && etapa.params.texto) || '';
          if (texto && card.telefoneNormalizado) {
            const user = await User.findById(exec.userId);
            if (user && user.whatsappBusiness && user.whatsappBusiness.accessToken) {
              // mesma trava de segurança do agente de IA: não manda por cima de um humano
              const ultimaHumana = await Message.findOne({
                cardId: card._id,
                direction: 'out',
                enviadoPorAgente: { $ne: true },
              }).sort({ timestamp: -1 });
              const humanoRecente = ultimaHumana && Date.now() - new Date(ultimaHumana.timestamp).getTime() < 30 * 60 * 1000;

              if (!humanoRecente) {
                try {
                  const data = await enviarMensagemGraphSimples(user, card, texto);
                  await Message.create({
                    userId: exec.userId,
                    cardId: card._id,
                    direction: 'out',
                    texto,
                    whatsappMessageId: data.messages && data.messages[0] && data.messages[0].id,
                    status: 'sent',
                    timestamp: new Date(),
                    enviadoPorAgente: true,
                  });
                } catch (e) {
                  console.error('Erro ao enviar mensagem do fluxo:', e.message);
                }
              }
            }
          }
        }

        exec.etapaAtual += 1;
        if (exec.etapaAtual >= fluxo.etapas.length) exec.concluido = true;
        await exec.save();
      } catch (e) {
        console.error('Erro ao processar execução de fluxo:', e.message);
      }
    }
  } catch (e) {
    console.error('Erro ao processar fluxos:', e.message);
  }
}

module.exports = { processarFluxos };
