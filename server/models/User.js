const mongoose = require('mongoose');

const googleCalendarSchema = new mongoose.Schema(
  {
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    expiryDate: { type: Number, default: null },
    calendarId: { type: String, default: null },
  },
  { _id: false }
);

const whatsappBusinessSchema = new mongoose.Schema(
  {
    phoneNumberId: { type: String, default: null },
    accessToken: { type: String, default: null },
    wabaId: { type: String, default: null },
    agenteIaAtivo: { type: Boolean, default: false }, // responde clientes sozinho, sem revisão humana
    iaProativaAtiva: { type: Boolean, default: false }, // só sugere no card, nunca envia nada sozinha
  },
  { _id: false }
);

const menuTriagemOpcaoSchema = new mongoose.Schema(
  {
    numero: { type: String, required: true, trim: true },
    colunaDestinoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', required: true },
    respostaConfirmacao: { type: String, default: '' },
  },
  { _id: false }
);
const menuTriagemSchema = new mongoose.Schema(
  {
    ativo: { type: Boolean, default: false },
    mensagemInicial: { type: String, default: '' },
    opcoes: { type: [menuTriagemOpcaoSchema], default: [] },
  },
  { _id: false }
);

const instagramLeadsSchema = new mongoose.Schema(
  {
    pageId: { type: String, default: null },
    pageAccessToken: { type: String, default: null },
    igBusinessId: { type: String, default: null }, // ID da conta comercial do Instagram — usado pras mensagens diretas (DM), separado do Page ID usado pra captação de leads
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    nome: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    senhaHash: { type: String, default: null }, // null quando a conta usa só login com Google
    googleId: { type: String, unique: true, sparse: true },
    googleCalendar: { type: googleCalendarSchema, default: () => ({}) },
    whatsappBusiness: { type: whatsappBusinessSchema, default: () => ({}) },
    instagramLeads: { type: instagramLeadsSchema, default: () => ({}) },
    menuTriagem: { type: menuTriagemSchema, default: () => ({ opcoes: [] }) },
    equipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipe', default: null },
    papelEquipe: { type: String, enum: ['supervisor', 'membro'], default: 'membro' },
    supervisorDeDados: { type: Boolean, default: false }, // acesso ao monitoramento de erros — separado do papel de gestor da equipe
    agendamentoPublico: {
      ativo: { type: Boolean, default: false },
      horaInicio: { type: String, default: '08:00' },
      horaFim: { type: String, default: '18:00' },
      duracaoMinutos: { type: Number, default: 30 },
      diasSemana: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0=domingo ... 6=sábado
      colunaDestinoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', default: null }, // onde o lead novo entra no funil
    },
    tokenVersion: { type: Number, default: 0 }, // incrementar invalida todos os tokens já emitidos (logout geral)
    icsToken: { type: String, default: null, unique: true, sparse: true }, // segredo do link de agenda (.ics) — ver server/routes/calendar.js
    avatarUrl: { type: String, default: null }, // imagem pequena em base64 (data URL)
    twoFactorSecret: { type: String, default: null }, // segredo TOTP — só existe enquanto ativado ou em processo de ativação
    twoFactorEnabled: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        ret.temSenha = !!ret.senhaHash;
        delete ret.senhaHash; // nunca devolver o hash da senha pro front-end
        delete ret.tokenVersion; // detalhe interno de segurança, não precisa ir pro front-end
        delete ret.twoFactorSecret; // nunca expor o segredo do 2FA pro front-end
        ret.googleCalendarConnected = !!(ret.googleCalendar && ret.googleCalendar.refreshToken);
        delete ret.googleCalendar; // tokens nunca saem do servidor
        ret.whatsappConnected = !!(ret.whatsappBusiness && ret.whatsappBusiness.accessToken && ret.whatsappBusiness.phoneNumberId);
        delete ret.whatsappBusiness; // token de acesso nunca sai do servidor
        ret.instagramConnected = !!(ret.instagramLeads && ret.instagramLeads.pageAccessToken && ret.instagramLeads.pageId);
        delete ret.instagramLeads; // token de acesso nunca sai do servidor
        ret.icsAtivo = !!ret.icsToken;
        delete ret.icsToken; // o token só é devolvido pela rota dedicada (GET /api/calendar/ics-status), nunca aqui
        ret.equipeId = ret.equipeId ? ret.equipeId.toString() : null;
        if (ret.menuTriagem && Array.isArray(ret.menuTriagem.opcoes)) {
          ret.menuTriagem.opcoes.forEach((op) => {
            if (op.colunaDestinoId) op.colunaDestinoId = op.colunaDestinoId.toString();
          });
        }
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema);
