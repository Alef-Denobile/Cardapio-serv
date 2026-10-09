const mongoose = require('mongoose');

function gerarCodigo() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const equipeSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    donoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    codigoConvite: { type: String, default: gerarCodigo, unique: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.donoId = ret.donoId.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

const Equipe = mongoose.model('Equipe', equipeSchema);
Equipe.gerarCodigo = gerarCodigo;

module.exports = Equipe;
