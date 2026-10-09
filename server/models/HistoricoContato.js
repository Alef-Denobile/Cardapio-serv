const mongoose = require('mongoose');

// Um registro de cada tentativa/interação de contato com um lead — "hoje tentei
// contato 3 vezes, cliente não atendeu", "respondeu no WhatsApp", etc. Fica
// ordenado por data, mais recente primeiro, como um diário do relacionamento
// com aquele cliente.
const historicoContatoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    texto: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.cardId = ret.cardId.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);
historicoContatoSchema.index({ userId: 1, cardId: 1, createdAt: -1 });

module.exports = mongoose.model('HistoricoContato', historicoContatoSchema);
