const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acao: { type: String, required: true }, // código curto: login, card_excluido, membro_removido, etc.
    detalhe: { type: String, default: '' }, // texto legível, ex: "Cliente João Silva excluído"
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.userId;
      },
    },
  }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
