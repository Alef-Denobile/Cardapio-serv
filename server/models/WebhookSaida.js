const mongoose = require('mongoose');
const crypto = require('crypto');

const EVENTOS_DISPONIVEIS = ['lead.criado', 'lead.movido', 'lead.ganho', 'mensagem.recebida', 'tarefa.criada'];

const webhookSaidaSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nome: { type: String, default: '' }, // só pra identificar na lista, ex: "Zapier - novo lead"
    url: { type: String, required: true },
    eventos: { type: [String], default: [], validate: (arr) => arr.every((e) => EVENTOS_DISPONIVEIS.includes(e)) },
    ativo: { type: Boolean, default: true },
    secreto: { type: String, default: () => crypto.randomBytes(16).toString('hex') }, // vai no header, pra quem recebe confirmar que veio da gente
    ultimoEnvioEm: { type: Date, default: null },
    ultimoEnvioStatus: { type: String, default: null }, // 'ok' | 'erro'
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('WebhookSaida', webhookSaidaSchema);
module.exports.EVENTOS_DISPONIVEIS = EVENTOS_DISPONIVEIS;
