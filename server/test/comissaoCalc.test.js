const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  calcComissaoParcelas,
  calcComissaoVeiculo,
  calcComissaoEquity,
  calcComissaoPorTipo,
  COMISSAO_PARCELAS_BLOCO1,
  COMISSAO_PARCELAS_BLOCO2,
  COMISSAO_VEICULO_PARCELAS,
  COMISSAO_EQUITY_PARCELAS,
} = require('../utils/comissaoCalc');

describe('calcComissaoParcelas (Imóvel / Investimento / Serviços)', () => {
  test('carta de R$1.000.000 gera os valores de referência conhecidos', () => {
    const { value1, value2 } = calcComissaoParcelas(1000000);
    assert.equal(value1, 1033.88);
    assert.equal(value2, 1905.61);
  });

  test('carta de R$0 não gera comissão negativa nem NaN', () => {
    const { value1, value2 } = calcComissaoParcelas(0);
    assert.equal(value1, 0);
    assert.equal(value2, 0);
  });

  test('aceita string numérica (vindo de formulário) sem quebrar', () => {
    const { value1 } = calcComissaoParcelas('500000');
    assert.equal(value1, 516.94);
  });

  test('valor inválido (texto) não quebra, cai pra 0', () => {
    const { value1, value2 } = calcComissaoParcelas('abc');
    assert.equal(value1, 0);
    assert.equal(value2, 0);
  });
});

describe('calcComissaoVeiculo', () => {
  test('carta de R$100.000 bate com o exemplo dado (1,6% ÷ 11 parcelas)', () => {
    const { valorParcela } = calcComissaoVeiculo(100000);
    // 100.000 x 1,6% = 1.600 / 11 = 145,4545... -> arredonda pra 145,45
    assert.equal(valorParcela, 145.45);
  });

  test('carta de R$0 não gera parcela negativa nem NaN', () => {
    const { valorParcela } = calcComissaoVeiculo(0);
    assert.equal(valorParcela, 0);
  });
});

describe('calcComissaoEquity (Home Equity / Car Equity)', () => {
  test('carta de R$100.000 gera 1,1% numa parcela só', () => {
    const { valorParcela } = calcComissaoEquity(100000);
    // 100.000 x 1,1% = 1.100,00
    assert.equal(valorParcela, 1100);
  });

  test('carta de R$0 não gera parcela negativa nem NaN', () => {
    const { valorParcela } = calcComissaoEquity(0);
    assert.equal(valorParcela, 0);
  });
});

describe('calcComissaoPorTipo — escolhe a fórmula certa conforme o tipo de carta', () => {
  test('tipo "veiculo" usa a fórmula de 11 parcelas iguais, sem segundo bloco', () => {
    const r = calcComissaoPorTipo(100000, 'veiculo');
    assert.equal(r.parcelas, COMISSAO_VEICULO_PARCELAS);
    assert.equal(r.parcelas1, COMISSAO_VEICULO_PARCELAS);
    assert.equal(r.value, 145.45);
    assert.equal(r.value2, 0);
  });

  test('tipo "home_equity" usa 1 parcela só de 1,1%', () => {
    const r = calcComissaoPorTipo(100000, 'home_equity');
    assert.equal(r.parcelas, COMISSAO_EQUITY_PARCELAS);
    assert.equal(r.parcelas1, COMISSAO_EQUITY_PARCELAS);
    assert.equal(r.value, 1100);
    assert.equal(r.value2, 0);
  });

  test('tipo "car_equity" usa a mesma fórmula de 1,1% numa parcela só', () => {
    const r = calcComissaoPorTipo(100000, 'car_equity');
    assert.equal(r.parcelas, COMISSAO_EQUITY_PARCELAS);
    assert.equal(r.value, 1100);
    assert.equal(r.value2, 0);
  });

  test('tipo "imovel" usa a fórmula de dois blocos (10 + 3 parcelas)', () => {
    const r = calcComissaoPorTipo(1000000, 'imovel');
    assert.equal(r.parcelas, COMISSAO_PARCELAS_BLOCO1 + COMISSAO_PARCELAS_BLOCO2);
    assert.equal(r.parcelas1, COMISSAO_PARCELAS_BLOCO1);
    assert.equal(r.value, 1033.88);
    assert.equal(r.value2, 1905.61);
  });

  test('tipo "investimento" e "servicos" usam a mesma fórmula de dois blocos', () => {
    const investimento = calcComissaoPorTipo(1000000, 'investimento');
    const servicos = calcComissaoPorTipo(1000000, 'servicos');
    assert.deepEqual(investimento, servicos);
  });

  test('tipo desconhecido/ausente cai no padrão de dois blocos (não quebra)', () => {
    const r = calcComissaoPorTipo(1000000, undefined);
    assert.equal(r.value, 1033.88);
  });
});
