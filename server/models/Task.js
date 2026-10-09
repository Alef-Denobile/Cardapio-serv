const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    titulo: { type: String, required: true, trim: true },
    vencimento: { type: Date, default: null },
    prioridade: { type: String, enum: ['baixa', 'media', 'alta'], default: 'media' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', default: null },
    descricao: { type: String, default: '' },
    concluida: { type: Boolean, default: false },
    googleEventId: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.leadId = ret.leadId ? ret.leadId.toString() : null;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Task', taskSchema);
