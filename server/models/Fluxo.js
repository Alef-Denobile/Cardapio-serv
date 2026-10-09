const mongoose = require('mongoose');

const etapaSchema = new mongoose.Schema(
  {
    diasAposInicio: { type: Number, required: true, min: 0 }, // quantos dias depois do início do fluxo essa etapa roda
    tipo: { type: String, enum: ['mensagem', 'tarefa', 'mover_coluna'], required: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const fluxoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nome: { type: String, required: true, trim: true },
    colunaGatilhoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', required: true }, // começa quando o cliente entra nessa coluna
    etapas: { type: [etapaSchema], default: [] },
    ativo: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.colunaGatilhoId = ret.colunaGatilhoId.toString();
        (ret.etapas || []).forEach((e) => {
          if (e.params && e.params.colunaDestinoId) e.params.colunaDestinoId = e.params.colunaDestinoId.toString();
        });
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Fluxo', fluxoSchema);
