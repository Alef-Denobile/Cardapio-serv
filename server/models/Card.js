const mongoose = require('mongoose');
const { normalizarTelefone } = require('../utils/telefone');

const cardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    columnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', required: true },
    ordem: { type: Number, default: 0 }, // posição dentro da coluna — usa espaçamento grande (1000 em 1000) pra caber muitas reordenações no meio sem precisar reajustar tudo
    cliente: { type: String, required: true, trim: true },
    tipoPessoa: { type: String, enum: ['fisica', 'juridica'], default: 'fisica' },
    cnpj: { type: String, default: '' },
    razaoSocial: { type: String, default: '' },
    inscricaoEstadual: { type: String, default: '' },
    ramoAtividade: { type: String, default: '' },
    contatoNome: { type: String, default: '' }, // pessoa responsável do lado da empresa
    contatoCargo: { type: String, default: '' },
    valor: { type: Number, default: 0 },
    temperatura: { type: String, enum: ['quente', 'morno', 'frio'], default: 'morno' },
    telefone: { type: String, default: '' },
    telefoneNormalizado: { type: String, default: null, index: true }, // só dígitos, com DDI — usado pra casar mensagens do WhatsApp
    instagramId: { type: String, default: null, index: true }, // ID do remetente no Instagram — usado pra casar mensagens de DM
    obs: { type: String, default: '' },
    // chave da Regra de Comissão (ver server/models/RegraComissao.js) — deixou de ser um enum
    // fixo pra permitir regras/tipos de carta criados e renomeados pelo usuário
    tipoCarta: { type: String, default: 'imovel', trim: true },
    mes: { type: String, default: '' }, // formato "YYYY-MM" — mês de referência/venda (já usado pra filtrar o Pipeline e sincronizar com Comissões)
    mesInicioContato: { type: String, default: '' }, // formato "YYYY-MM" — quando o contato com esse cliente começou, pra documentar o ciclo de venda
    colunaDesde: { type: Date, default: Date.now }, // quando entrou na coluna atual — usado pelas automações por tempo
    automacoesDisparadas: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // evita repetir a mesma automação por tempo no mesmo card
    sugestaoIA: {
      texto: { type: String, default: null },
      tarefaTitulo: { type: String, default: null },
      tarefaDias: { type: Number, default: null },
      geradaEm: { type: Date, default: null },
    },
    aguardandoMenuTriagem: { type: Boolean, default: false }, // true logo depois de mandar o menu de triagem, até a pessoa responder
    etiquetas: { type: [String], default: [] },
    camposPersonalizados: { type: mongoose.Schema.Types.Mixed, default: {} }, // { campoId: valor }
    arquivado: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.columnId = ret.columnId ? ret.columnId.toString() : null;
        delete ret._id;
        delete ret.__v;
        delete ret.automacoesDisparadas; // detalhe interno, não precisa ir pro front-end
      },
    },
  }
);

// mantém telefoneNormalizado em dia tanto em .create()/.save() quanto em findOneAndUpdate();
// também reseta colunaDesde/automacoesDisparadas sempre que o card muda de coluna
cardSchema.pre('save', function (next) {
  if (this.isModified('telefone')) this.telefoneNormalizado = normalizarTelefone(this.telefone);
  if (this.isModified('columnId')) {
    this.colunaDesde = new Date();
    this.automacoesDisparadas = [];
  }
  next();
});
cardSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update && update.telefone !== undefined) {
    update.telefoneNormalizado = normalizarTelefone(update.telefone);
  }
  if (update && update.columnId !== undefined) {
    update.colunaDesde = new Date();
    update.automacoesDisparadas = [];
  }
  next();
});

module.exports = mongoose.model('Card', cardSchema);
