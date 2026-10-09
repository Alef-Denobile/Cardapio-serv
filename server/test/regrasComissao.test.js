const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  calcComissaoPorTipo,
  calcComissaoPorBlocos,
  resumoLegadoDeBlocos,
  calcComissaoPorRegra,
} = require('../utils/comissaoCalc');
const { REGRAS_PADRAO, slugify } = require('../utils/regrasComissao');

describe('calcComissaoPorBlocos — motor genérico da engrenagem de Comissões', () => {
  test('um bloco só: calcula parcelas x percentual, arredondado a centavos', () => {
    const r = calcComissaoPorBlocos(100000, [{ parcelas: 1, percentual: 0.011 }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].parcelas, 1);
    assert.equal(r[0].value, 1100);
  });

  test('vários blocos: cada linha calcula seu próprio valor independentemente', () => {
    const r = calcComissaoPorBlocos(1000000, [
      { parcelas: 10, percentual: 1033.88 / 1000000 },
      { parcelas: 3, percentual: 1905.61 / 1000000 },
    ]);
    assert.equal(r[0].value, 1033.88);
    assert.equal(r[1].value, 1905.61);
  });

  test('lista de blocos vazia ou inválida não quebra — cai num bloco de 0%', () => {
    const r = calcComissaoPorBlocos(100000, []);
    assert.equal(r.length, 1);
    assert.equal(r[0].value, 0);
  });

  test('valor de carta inválido (texto) não quebra, cai pra 0', () => {
    const r = calcComissaoPorBlocos('abc', [{ parcelas: 1, percentual: 0.1 }]);
    assert.equal(r[0].value, 0);
  });
});

describe('resumoLegadoDeBlocos — compatibilidade com contratos antigos (parcelas/parcelas1/value/value2)', () => {
  test('1 bloco só: value2 fica 0 e parcelas1 = parcelas do único bloco', () => {
    const blocos = calcComissaoPorBlocos(100000, [{ parcelas: 11, percentual: 0.016 / 11 }]);
    const resumo = resumoLegadoDeBlocos(blocos);
    assert.equal(resumo.parcelas, 11);
    assert.equal(resumo.parcelas1, 11);
    assert.equal(resumo.value2, 0);
  });

  test('3+ blocos: resumo legado usa só os 2 primeiros, mas "parcelas" soma todos', () => {
    const blocos = calcComissaoPorBlocos(100000, [
      { parcelas: 5, percentual: 0.01 },
      { parcelas: 5, percentual: 0.02 },
      { parcelas: 5, percentual: 0.03 },
    ]);
    const resumo = resumoLegadoDeBlocos(blocos);
    assert.equal(resumo.parcelas, 15);
    assert.equal(resumo.parcelas1, 5);
    assert.equal(resumo.value, 1000);
    assert.equal(resumo.value2, 2000);
  });
});

describe('Paridade: motor novo (regras padrão) precisa bater 100% com o cálculo antigo fixo', () => {
  const valoresDeTeste = [0, 1, 100, 999, 1000, 12345.67, 50000, 100000, 250000, 333333.33, 1000000, 5000000, 9999999.99, 25000000];

  for (const regra of REGRAS_PADRAO) {
    test(`regra "${regra.chave}" — mesmos valores do calcComissaoPorTipo para vários valores de carta`, () => {
      for (const valor of valoresDeTeste) {
        const antigo = calcComissaoPorTipo(valor, regra.chave);
        const novo = calcComissaoPorRegra(valor, regra);
        assert.equal(novo.parcelas, antigo.parcelas, `parcelas diverge em ${regra.chave}/${valor}`);
        assert.equal(novo.parcelas1, antigo.parcelas1, `parcelas1 diverge em ${regra.chave}/${valor}`);
        assert.equal(novo.value, antigo.value, `value diverge em ${regra.chave}/${valor}`);
        assert.equal(novo.value2, antigo.value2, `value2 diverge em ${regra.chave}/${valor}`);
      }
    });
  }
});

describe('slugify — transforma nome digitado numa chave técnica estável', () => {
  test('remove acentos, deixa minúsculo e troca espaço por underscore', () => {
    assert.equal(slugify('Consórcio Pesado'), 'consorcio_pesado');
  });
  test('remove pontuação e símbolos', () => {
    assert.equal(slugify('Veículo (usado) - 2ª via!'), 'veiculo_usado_2_via');
  });
  test('string vazia ou só símbolos cai num nome padrão', () => {
    assert.equal(slugify(''), 'regra');
    assert.equal(slugify('!!!'), 'regra');
  });
});
