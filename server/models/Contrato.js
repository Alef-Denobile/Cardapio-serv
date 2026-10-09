const mongoose = require('mongoose');

const contratoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', default: null }, // preenchido só quando gerado automaticamente pelo Pipeline
    geradoAutomaticamente: { type: Boolean, default: false },
    desc: { type: String, required: true, trim: true },
    scope: { type: String, enum: ['Pessoal', 'Empresa'], default: 'Pessoal' },
    date: { type: Date, required: true }, // mês da 1ª parcela (dia 1)
    creditoValor: { type: Number, required: true }, // valor da carta de crédito vendida
    // chave da Regra de Comissão usada (ver server/models/RegraComissao.js) — deixou de ser um
    // enum fixo pra permitir regras criadas/editadas pelo usuário na engrenagem de Comissões
    tipoCarta: { type: String, default: 'imovel', trim: true },
    regraNome: { type: String, default: '' }, // nome da regra no momento em que essa comissão foi calculada (sobrevive mesmo se a regra for renomeada/excluída depois)

    // calculados uma vez, na criação/edição, e guardados — assim o histórico
    // não muda retroativamente se a regra de cálculo mudar no futuro
    parcelas: { type: Number, required: true },
    parcelas1: { type: Number, required: true },
    value: { type: Number, required: true },
    value2: { type: Number, required: true },
    // detalhe completo (N blocos) da regra usada — os 4 campos acima continuam existindo
    // (resumo dos 2 primeiros blocos) pra manter compatibilidade com contratos antigos e
    // com qualquer lugar do sistema que ainda lê só parcelas/value/value2
    blocos: {
      type: [{ parcelas: Number, percentual: Number, value: Number, _id: false }],
      default: undefined,
    },

    // a partir desse mês (incluindo ele), o contrato para de contar comissão —
    // usado quando o cliente cancela a carta de crédito no meio do caminho
    canceladoNoMes: { type: String, default: null }, // formato "YYYY-MM"
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.cardId = ret.cardId ? ret.cardId.toString() : null;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model('Contrato', contratoSchema);
