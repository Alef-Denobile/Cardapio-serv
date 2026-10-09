const mongoose = require('mongoose');

// Cada documento é UM bloco na grade semanal do GEROT (Gestão de Rotina) — um
// "molde" de como a semana de trabalho deveria se parecer, diferente da Agenda
// normal (que é sobre compromissos/tarefas específicos de uma data). Um bloco
// cobre um INTERVALO de horário (ex: "09:00" até "10:30"), podendo assim ocupar
// várias linhas de meia hora na grade — como células mescladas numa planilha.
const gerotBlocoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    semanaInicio: { type: String, required: true }, // segunda-feira daquela semana, formato "YYYY-MM-DD"
    diaSemana: { type: Number, required: true, min: 0, max: 4 }, // 0=segunda ... 4=sexta
    horarioInicio: { type: String, required: true }, // "08:00" ... "19:00"
    horarioFim: { type: String, required: true }, // exclusivo: o bloco cobre até (mas não incluindo) esse horário
    texto: { type: String, required: true },
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
gerotBlocoSchema.index({ userId: 1, semanaInicio: 1, diaSemana: 1 });

module.exports = mongoose.model('GerotBloco', gerotBlocoSchema);
