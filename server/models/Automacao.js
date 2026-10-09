const mongoose = require('mongoose');

const automacaoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nome: { type: String, required: true, trim: true },
    colunaGatilhoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', required: true },
    // 'entrada_coluna' -> dispara na hora em que o cliente entra na coluna
    // 'tempo_parado'   -> dispara quando o cliente fica X dias parado na coluna (checado periodicamente)
    gatilhoTipo: { type: String, enum: ['entrada_coluna', 'tempo_parado'], default: 'entrada_coluna' },
    acaoTipo: { type: String, enum: ['criar_tarefa', 'mover_coluna'], required: true },
    acaoParams: { type: mongoose.Schema.Types.Mixed, default: {} },
    ativa: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.colunaGatilhoId = ret.colunaGatilhoId.toString();
        if (ret.acaoParams && ret.acaoParams.colunaDestinoId) {
          ret.acaoParams.colunaDestinoId = ret.acaoParams.colunaDestinoId.toString();
        }
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Automacao', automacaoSchema);
