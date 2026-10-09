const mongoose = require('mongoose');

const chatMensagemSchema = new mongoose.Schema(
  {
    equipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipe', required: true },
    remetenteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    remetenteNome: { type: String, default: '' }, // guardado aqui pra não precisar de populate a cada leitura
    destinatarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = chat da equipe inteira; preenchido = conversa privada entre 2 pessoas
    texto: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.equipeId = ret.equipeId.toString();
        ret.remetenteId = ret.remetenteId.toString();
        ret.destinatarioId = ret.destinatarioId ? ret.destinatarioId.toString() : null;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('ChatMensagem', chatMensagemSchema);
