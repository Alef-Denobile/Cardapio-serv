const mongoose = require('mongoose');

// Guarda os campos que só existem no nosso CRM (prioridade, lead relacionado) e que
// o Google Agenda não tem como entender — amarrados ao evento pelo ID dele, sem
// duplicar o evento inteiro. Título, data, hora e descrição continuam vivendo
// só no Google, como fonte única da verdade.
const eventoGoogleExtraSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventId: { type: String, required: true }, // ID do evento no Google Agenda
    prioridade: { type: String, enum: ['baixa', 'media', 'alta'], default: 'media' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', default: null },
    concluida: { type: Boolean, default: false },
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
eventoGoogleExtraSchema.index({ userId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('EventoGoogleExtra', eventoGoogleExtraSchema);
