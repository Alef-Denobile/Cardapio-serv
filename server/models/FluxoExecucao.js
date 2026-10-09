const mongoose = require('mongoose');

const fluxoExecucaoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fluxoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fluxo', required: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    etapaAtual: { type: Number, default: 0 }, // índice da próxima etapa a executar
    iniciadoEm: { type: Date, default: Date.now },
    concluido: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.fluxoId = ret.fluxoId.toString();
        ret.cardId = ret.cardId.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('FluxoExecucao', fluxoExecucaoSchema);
