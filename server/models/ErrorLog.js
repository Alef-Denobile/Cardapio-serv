const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema(
  {
    mensagem: { type: String, required: true },
    stack: { type: String, default: '' },
    rota: { type: String, default: '' }, // ex: "POST /api/cards"
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // quem estava logado quando aconteceu, se souber
    tipo: { type: String, enum: ['rota', 'excecao_nao_tratada', 'promise_rejeitada'], default: 'rota' },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.userId = ret.userId ? ret.userId.toString() : null;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

// Os erros mais antigos que 30 dias somem sozinhos — é um log de monitoramento, não
// precisa virar um arquivo histórico gigante guardado pra sempre.
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('ErrorLog', errorLogSchema);
