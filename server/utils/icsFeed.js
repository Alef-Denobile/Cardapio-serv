/* Gera um arquivo .ics (iCalendar, RFC 5545) a partir das tarefas do usuário — é o feed
   público de agenda que qualquer app de calendário (Google, Apple, Outlook, etc.) consegue
   "assinar" por URL, sem precisar conectar conta nenhuma. Existe pra tirar a dependência do
   Google Agenda de quem for usar o painel fora da operação original (ver server/routes/calendar.js). */

// Escapa texto conforme a RFC 5545 (tipo de valor TEXT): barra invertida, ponto e vírgula,
// vírgula e quebra de linha.
function escaparTextoIcs(texto) {
  return String(texto || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

// Quebra linhas maiores que 75 octets em continuação ("line folding" da RFC 5545) — cada
// linha de continuação começa com um espaço. Evita que apps de calendário mais estritos
// rejeitem o arquivo com títulos/descrições longas.
function dobrarLinhaIcs(linha) {
  if (linha.length <= 75) return linha;
  const partes = [];
  let resto = linha;
  let primeira = true;
  while (resto.length > 0) {
    const tamanho = primeira ? 75 : 74;
    partes.push(resto.slice(0, tamanho));
    resto = resto.slice(tamanho);
    primeira = false;
  }
  return partes.join('\r\n ');
}

function formatarDataHoraUtc(data) {
  return data.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
function formatarSoDataUtc(data) {
  return data.toISOString().slice(0, 10).replace(/-/g, '');
}

// Tarefas sem horário guardam meia-noite UTC — mesma convenção que o front-end já usa
// (ver dataLocalDaTarefa em public/js/script.js) pra diferenciar "tem hora marcada" de
// "só tem o dia". Vira um evento de dia inteiro (VALUE=DATE) em vez de com hora.
function temHorarioMarcado(data) {
  return data.getUTCHours() !== 0 || data.getUTCMinutes() !== 0;
}

// tarefas: lista de { id/_id, titulo, vencimento, descricao, concluida, leadId (populado com .cliente, opcional) }
function gerarIcs(tarefas, nomeCalendario) {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Painel CRM//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTextoIcs(nomeCalendario || 'Agenda — Painel CRM')}`,
  ];
  const agora = formatarDataHoraUtc(new Date());

  for (const t of tarefas || []) {
    if (!t.vencimento) continue;
    const dt = new Date(t.vencimento);
    if (isNaN(dt.getTime())) continue;

    const clienteNome = t.leadId && t.leadId.cliente ? t.leadId.cliente : null;
    const titulo = (t.concluida ? '✓ ' : '') + (t.titulo || 'Tarefa') + (clienteNome ? ` — ${clienteNome}` : '');
    const descricaoPartes = [];
    if (clienteNome) descricaoPartes.push(`Cliente: ${clienteNome}`);
    if (t.descricao) descricaoPartes.push(t.descricao);

    linhas.push('BEGIN:VEVENT');
    linhas.push(`UID:tarefa-${(t._id || t.id || '').toString()}@painel-crm`);
    linhas.push(`DTSTAMP:${agora}`);
    linhas.push(
      temHorarioMarcado(dt)
        ? `DTSTART:${formatarDataHoraUtc(dt)}`
        : `DTSTART;VALUE=DATE:${formatarSoDataUtc(dt)}`
    );
    linhas.push(`SUMMARY:${escaparTextoIcs(titulo)}`);
    if (descricaoPartes.length) linhas.push(`DESCRIPTION:${escaparTextoIcs(descricaoPartes.join(' — '))}`);
    linhas.push('STATUS:CONFIRMED');
    linhas.push('END:VEVENT');
  }

  linhas.push('END:VCALENDAR');
  return linhas.map(dobrarLinhaIcs).join('\r\n') + '\r\n';
}

module.exports = { gerarIcs, escaparTextoIcs, temHorarioMarcado };
