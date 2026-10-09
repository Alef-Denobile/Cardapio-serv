const mongoose = require('mongoose');

const metaVendasSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mes: { type: String, required: true }, // formato "YYYY-MM"
    valorMeta: { type: Number, default: 0 },
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
metaVendasSchema.index({ userId: 1, mes: 1 }, { unique: true });

module.exports = mongoose.model('MetaVendas', metaVendasSchema);
