const mongoose = require('mongoose');

const possivelLeadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nome: { type: String, default: '' },
    telefone: { type: String, default: '' },
    tipoServico: { type: String, default: '' },
    origemArquivo: { type: String, default: '' }, // nome do arquivo importado, só pra referência
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

module.exports = mongoose.model('PossivelLead', possivelLeadSchema);
