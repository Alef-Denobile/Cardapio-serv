const mongoose = require('mongoose');

const columnSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    funilId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funil', default: null },
    nome: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ['aberto', 'ganho', 'perdido'], default: 'aberto' },
    probabilidade: { type: Number, default: 50, min: 0, max: 100 }, // % de chance de fechar, usado no valor ponderado
    ordem: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.funilId = ret.funilId ? ret.funilId.toString() : null;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Column', columnSchema);
