const mongoose = require('mongoose');

const anexoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    nomeArquivo: { type: String, required: true },
    tipoMime: { type: String, default: 'application/octet-stream' },
    dadosBase64: { type: String, required: true }, // arquivo inteiro, já em base64 (data URL)
    tamanho: { type: Number, default: 0 }, // em bytes, calculado no upload
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

module.exports = mongoose.model('Anexo', anexoSchema);
