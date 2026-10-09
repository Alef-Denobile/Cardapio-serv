// Produtos por horário (função extra "horarios", desligada por padrão).
// Cada produto pode ter { dias: [0..6] (0 = domingo), de: 'HH:MM', ate: 'HH:MM' }.
// Ex.: café da manhã { dias: [0,1,2,3,4,5,6], de: '06:00', ate: '11:00' }; executivo { dias: [1,2,3,4,5], de: '11:00', ate: '15:00' }.
// Fora do horário o produto aparece como "indisponível agora" e não pode ser pedido (pedido agendado vale o horário agendado).
const { recursosDe } = require('./recursos');
const { ErroApp } = require('./util');

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const min = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + (m || 0); };
const horaOk = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));

function limpar(d) {
  if (!d || d.ativo === false) return null;
  const dias = [...new Set((Array.isArray(d.dias) ? d.dias : []).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
  if (!dias.length) throw new ErroApp(400, 'Marque pelo menos um dia em que o produto fica disponível.');
  if (!horaOk(d.de) || !horaOk(d.ate)) throw new ErroApp(400, 'Informe o horário no formato 08:00.');
  if (d.de === d.ate) throw new ErroApp(400, 'O horário de início e de fim não podem ser iguais.');
  return { dias, de: d.de, ate: d.ate };
}

// Dia da semana e minutos no fuso do restaurante
function agoraLocal(data, fuso) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: fuso || 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(data);
  const g = t => p.find(x => x.type === t).value;
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}
// Atravessa a meia-noite (ex.: 22:00 às 02:00): a madrugada conta como o dia anterior
function disponivel(disp, data, fuso) {
  if (!disp) return true;
  const a = agoraLocal(data || new Date(), fuso), de = min(disp.de), ate = min(disp.ate);
  if (de < ate) return disp.dias.includes(a.dia) && a.min >= de && a.min < ate;
  return (disp.dias.includes(a.dia) && a.min >= de) || (disp.dias.includes((a.dia + 6) % 7) && a.min < ate);
}
function texto(disp) {
  if (!disp) return '';
  const d = disp.dias, todos = d.length === 7, util = d.join() === '1,2,3,4,5', fim = d.join() === '0,6';
  const dias = todos ? 'todos os dias' : util ? 'seg a sex' : fim ? 'sáb e dom' : d.map(x => DIAS[x]).join(', ');
  return dias + ' · ' + disp.de + ' às ' + disp.ate;
}
const ligado = rest => recursosDe(rest).horarios;

module.exports = { limpar, disponivel, texto, ligado, agoraLocal };
