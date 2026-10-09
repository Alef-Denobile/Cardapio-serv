const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    direction: { type: String, enum: ['in', 'out'], required: true }, // in = cliente escreveu, out = nós escrevemos
    canal: { type: String, enum: ['whatsapp', 'instagram'], default: 'whatsapp' },
    texto: { type: String, default: '' },
    status: { type: String, default: null }, // sent | delivered | read | failed (só pra 'out')
    whatsappMessageId: { type: String, default: null },
    instagramMessageId: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
    enviadoPorAgente: { type: Boolean, default: false }, // true = respondida sozinha pelo agente de IA, não por um humano
    anexoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Anexo', default: null }, // preenchido quando a mensagem trouxe mídia (foto, áudio, documento)
    midiaTipo: { type: String, default: null }, // 'image' | 'audio' | 'document' | 'video' | null
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.cardId = ret.cardId ? ret.cardId.toString() : null;
        ret.anexoId = ret.anexoId ? ret.anexoId.toString() : null;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Message', messageSchema);
