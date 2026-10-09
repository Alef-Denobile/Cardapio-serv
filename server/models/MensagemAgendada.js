const mongoose = require('mongoose');

const mensagemAgendadaSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    texto: { type: String, required: true, trim: true },
    agendadoPara: { type: Date, required: true },
    status: { type: String, enum: ['pendente', 'enviada', 'cancelada', 'falhou'], default: 'pendente' },
    erro: { type: String, default: null },
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

module.exports = mongoose.model('MensagemAgendada', mensagemAgendadaSchema);
