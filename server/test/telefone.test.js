const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarTelefone } = require('../utils/telefone');

describe('normalizarTelefone', () => {
  test('número brasileiro sem DDI ganha o 55 na frente', () => {
    assert.equal(normalizarTelefone('15991234567'), '5515991234567');
  });

  test('número já com 55 na frente não duplica o código do país', () => {
    assert.equal(normalizarTelefone('5515991234567'), '5515991234567');
  });

  test('remove espaços, parênteses e traços', () => {
    assert.equal(normalizarTelefone('(15) 99123-4567'), '5515991234567');
  });

  test('remove o "+" de formato internacional', () => {
    assert.equal(normalizarTelefone('+55 15 99123-4567'), '5515991234567');
  });

  test('string vazia ou só texto sem dígito retorna null', () => {
    assert.equal(normalizarTelefone(''), null);
    assert.equal(normalizarTelefone('sem número'), null);
  });

  test('undefined/null não quebra, retorna null', () => {
    assert.equal(normalizarTelefone(undefined), null);
    assert.equal(normalizarTelefone(null), null);
  });
});
