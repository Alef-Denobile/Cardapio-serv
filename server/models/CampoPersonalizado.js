const mongoose = require('mongoose');

const campoPersonalizadoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nome: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ['texto', 'numero', 'data'], default: 'texto' },
    ordem: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('CampoPersonalizado', campoPersonalizadoSchema);
