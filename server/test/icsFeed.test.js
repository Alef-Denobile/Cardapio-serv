const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { gerarIcs, escaparTextoIcs, temHorarioMarcado } = require('../utils/icsFeed');

describe('escaparTextoIcs — escapa caracteres especiais da RFC 5545', () => {
  test('escapa vírgula, ponto e vírgula e barra invertida', () => {
    assert.equal(escaparTextoIcs('Ligar, confirmar; revisar \\ proposta'), 'Ligar\\, confirmar\\; revisar \\\\ proposta');
  });
  test('troca quebra de linha por \\n literal', () => {
    assert.equal(escaparTextoIcs('linha 1\nlinha 2'), 'linha 1\\nlinha 2');
  });
  test('texto vazio/undefined não quebra', () => {
    assert.equal(escaparTextoIcs(undefined), '');
  });
});

describe('temHorarioMarcado — diferencia tarefa com hora de tarefa só com o dia', () => {
  test('meia-noite UTC = sem horário marcado (evento de dia inteiro)', () => {
    assert.equal(temHorarioMarcado(new Date('2026-09-28T00:00:00.000Z')), false);
  });
  test('qualquer outro horário = tem horário marcado', () => {
    assert.equal(temHorarioMarcado(new Date('2026-09-28T14:30:00.000Z')), true);
  });
});

describe('gerarIcs — monta um feed .ics válido a partir das tarefas', () => {
  test('calendário vazio ainda gera um VCALENDAR válido (sem quebrar)', () => {
    const ics = gerarIcs([], 'Agenda — Teste');
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
    assert.match(ics, /VERSION:2\.0/);
  });

  test('uma tarefa com hora marcada gera DTSTART com hora (não VALUE=DATE)', () => {
    const ics = gerarIcs([
      { id: '1', titulo: 'Ligar pro cliente', vencimento: new Date('2026-10-05T13:00:00.000Z'), descricao: '', concluida: false },
    ], 'Agenda');
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /DTSTART:20261005T130000Z/);
    assert.match(ics, /SUMMARY:Ligar pro cliente/);
    assert.match(ics, /UID:tarefa-1@painel-crm/);
  });

  test('uma tarefa sem hora marcada (meia-noite) vira evento de dia inteiro', () => {
    const ics = gerarIcs([
      { id: '2', titulo: 'Enviar proposta', vencimento: new Date('2026-10-06T00:00:00.000Z'), descricao: '', concluida: false },
    ], 'Agenda');
    assert.match(ics, /DTSTART;VALUE=DATE:20261006/);
    assert.doesNotMatch(ics, /DTSTART:20261006T/);
  });

  test('tarefa concluída ganha o prefixo ✓ no título', () => {
    const ics = gerarIcs([
      { id: '3', titulo: 'Follow-up', vencimento: new Date('2026-10-07T09:00:00.000Z'), descricao: '', concluida: true },
    ], 'Agenda');
    assert.match(ics, /SUMMARY:✓ Follow-up/);
  });

  test('nome do cliente (lead vinculado) aparece no título e na descrição', () => {
    const ics = gerarIcs([
      { id: '4', titulo: 'Reunião', vencimento: new Date('2026-10-08T10:00:00.000Z'), descricao: 'Discutir contrato', concluida: false, leadId: { cliente: 'Maria Silva' } },
    ], 'Agenda');
    assert.match(ics, /SUMMARY:Reunião — Maria Silva/);
    assert.match(ics, /DESCRIPTION:Cliente: Maria Silva — Discutir contrato/);
  });

  test('tarefa sem vencimento é ignorada, não quebra o feed', () => {
    const ics = gerarIcs([
      { id: '5', titulo: 'Sem data', vencimento: null, descricao: '', concluida: false },
    ], 'Agenda');
    assert.doesNotMatch(ics, /BEGIN:VEVENT/);
  });

  test('vírgula e ponto e vírgula no título não quebram o formato', () => {
    const ics = gerarIcs([
      { id: '6', titulo: 'Ligar, confirmar; revisar', vencimento: new Date('2026-10-09T10:00:00.000Z'), descricao: '', concluida: false },
    ], 'Agenda');
    assert.match(ics, /SUMMARY:Ligar\\, confirmar\\; revisar/);
  });

  test('título bem longo é dobrado em linha de continuação (RFC 5545)', () => {
    const tituloLongo = 'Preparar apresentação completa pro cliente sobre consórcio de imóvel com todos os detalhes financeiros';
    const ics = gerarIcs([
      { id: '7', titulo: tituloLongo, vencimento: new Date('2026-10-10T10:00:00.000Z'), descricao: '', concluida: false },
    ], 'Agenda');
    const linhas = ics.split('\r\n');
    assert.ok(linhas.every(l => l.length <= 75 || l.startsWith(' ')), 'nenhuma linha deveria passar de 75 caracteres sem dobrar');
    assert.ok(linhas.some(l => l.startsWith(' ')), 'deveria ter pelo menos uma linha de continuação');
  });
});
