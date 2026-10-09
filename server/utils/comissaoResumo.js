// Espelha a mesma lógica de server/../public/js/script.js (funções parcelaValue,
// contratoIdxCancelamento, parcelaAtivaNoMes, comissoesStats) — usada aqui pra dar ao
// assistente de IA um resumo correto de comissões sem duplicar regras de negócio
// divergentes entre front e back.
function paraAnoMes(valor) {
  if (!valor) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 7);
  return String(valor).slice(0, 7); // já veio como string (ex: canceladoNoMes)
}
function monthsBetween(anchorYM, targetYM) {
  const [ay, am] = anchorYM.split('-').map(Number);
  const [ty, tm] = targetYM.split('-').map(Number);
  return (ty - ay) * 12 + (tm - am);
}
function parcelaValue(c, idx) {
  return idx < c.parcelas1 ? c.value : c.value2;
}
function contratoIdxCancelamento(c) {
  if (!c.canceladoNoMes) return Infinity;
  return monthsBetween(paraAnoMes(c.date), paraAnoMes(c.canceladoNoMes));
}
function parcelaAtivaNoMes(c, idx) {
  return idx >= 0 && idx < c.parcelas && idx < contratoIdxCancelamento(c);
}
function resumoComissoesDoMes(contratos, mesYM) {
  let previstoMes = 0;
  let totalAtivo = 0;
  contratos.forEach((c) => {
    const idx = monthsBetween(paraAnoMes(c.date), mesYM);
    if (parcelaAtivaNoMes(c, idx)) previstoMes += parcelaValue(c, idx);
    const limite = Math.min(c.parcelas, contratoIdxCancelamento(c));
    for (let i = Math.max(0, idx); i < limite; i++) {
      totalAtivo += parcelaValue(c, i);
    }
  });
  return { previstoMes, totalAtivo, totalContratos: contratos.length };
}

module.exports = { resumoComissoesDoMes };
