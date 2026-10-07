// NFC-e (nota fiscal do consumidor eletrônica), emitida por uma empresa emissora autorizada.
//   FISCAL_PROVEDOR=demo      -> simula a autorização e mostra um cupom "sem valor fiscal" (padrão, para demonstrar)
//   FISCAL_PROVEDOR=focusnfe  -> emite de verdade pela API da Focus NFe (https://focusnfe.com.br)
//   FISCAL_PROVEDOR=off       -> desligado
// Para emitir de verdade, cada restaurante precisa: CNPJ e inscrição estadual, certificado digital A1 e o CSC
// (código de segurança do contribuinte) cadastrados no painel da Focus NFe; aqui fica só o token da empresa.
const crypto = require('crypto');
const config = require('../config');
const { ErroApp, cnpjValido } = require('./util');

// Formas de pagamento da NFC-e (tabela da SEFAZ)
const FORMAS = { '01': 'Dinheiro', '03': 'Cartão de crédito', '04': 'Cartão de débito', '17': 'Pix', '99': 'Outros' };
const FORMA_PADRAO = { dinheiro: '01', cartao: '03', pix: '17', online: '03' }; // "local" (pagar no local) o caixa escolhe na hora

const provedorNome = () => config.fiscalProvedor;
const ativo = () => ['demo', 'focusnfe'].includes(config.fiscalProvedor);

// O que falta configurar para emitir (vazio = pronto)
function pendencias(rest) {
  if (config.fiscalProvedor === 'demo') return [];
  const f = rest.fiscal || {}, p = [];
  if (!cnpjValido(f.cnpj)) p.push('CNPJ');
  if (!f.ie) p.push('inscrição estadual');
  if (!rest.fiscal.tokenConfigurado) p.push('token do emissor');
  return p;
}

const dinheiro = v => (Math.round(v * 100) / 100).toFixed(2);
function itensDaNota(rest, pedido, produtosFiscais) {
  const f = rest.fiscal || {};
  return pedido.linhas.map((l, i) => {
    const pf = (produtosFiscais.get(String(l.produto)) || {});
    const desc = (l.nome + (l.opcoes && l.opcoes.length ? ' (' + l.opcoes.join(', ') + ')' : '')).slice(0, 120);
    return {
      numero_item: String(i + 1), codigo_produto: String(l.produto || 'item' + (i + 1)).replace(/-/g, '').slice(0, 20), descricao: desc,
      codigo_ncm: pf.ncm || f.ncm || '21069090', cfop: pf.cfop || f.cfop || '5102',
      icms_origem: '0', icms_situacao_tributaria: pf.csosn || f.csosn || '102',
      unidade_comercial: 'UN', unidade_tributavel: 'UN', quantidade_comercial: String(l.qtd), quantidade_tributavel: String(l.qtd),
      valor_unitario_comercial: dinheiro(l.unit), valor_unitario_tributavel: dinheiro(l.unit), valor_bruto: dinheiro(l.unit * l.qtd)
    };
  });
}

// Monta o corpo da NFC-e. Vão na nota só os produtos: taxa de serviço (gorjeta) e taxa de entrega ficam de fora;
// confirme com o contador do restaurante se ele prefere outra forma.
function corpoNota(rest, pedido, produtosFiscais, forma, cpf) {
  const itens = itensDaNota(rest, pedido, produtosFiscais);
  const total = dinheiro(itens.reduce((a, i) => a + Number(i.valor_bruto), 0));
  const corpo = {
    cnpj_emitente: String((rest.fiscal || {}).cnpj || '').replace(/\D/g, ''),
    data_emissao: new Date().toISOString(),
    natureza_operacao: 'Venda ao consumidor',
    tipo_documento: '1', finalidade_emissao: '1',
    presenca_comprador: pedido.tipo === 'delivery' ? '4' : '1', // 4 = entrega em domicílio, 1 = presencial
    modalidade_frete: '9', local_destino: '1',
    valor_produtos: total, valor_desconto: '0.00', valor_total: total,
    items: itens,
    formas_pagamento: [{ forma_pagamento: forma, valor_pagamento: total }]
  };
  if (cpf) corpo.cpf_destinatario = cpf;
  return corpo;
}

const BASE = amb => amb === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
async function focus(metodo, amb, caminho, token, corpo) {
  let r;
  try {
    r = await fetch(BASE(amb) + caminho, { method: metodo, headers: { Authorization: 'Basic ' + Buffer.from(token + ':').toString('base64'), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(30000) });
  } catch (e) { throw new ErroApp(502, 'Não foi possível falar com o emissor de notas agora. Tente de novo em instantes.'); }
  const d = await r.json().catch(() => ({}));
  return { http: r.status, d };
}
// Converte a resposta da Focus NFe para o nosso formato
function lerFocus(amb, d) {
  const st = d.status === 'autorizado' ? 'autorizada' : d.status === 'cancelado' ? 'cancelada' : /processando/.test(d.status || '') ? 'processando' : 'erro';
  const url = x => x ? (/^https?:/.test(x) ? x : BASE(amb) + x) : null;
  return { status: st, chave: d.chave_nfe || null, numero: d.numero ? Number(d.numero) : null, serie: d.serie ? Number(d.serie) : null,
    urlDanfe: url(d.caminho_danfe), urlXml: url(d.caminho_xml_nota_fiscal),
    mensagem: d.mensagem_sefaz || d.mensagem || (Array.isArray(d.erros) ? d.erros.map(e => e.mensagem).join('; ') : '') || '' };
}

// Emite a nota. Devolve { status, chave, numero, serie, urlDanfe, urlXml, mensagem }.
async function emitir({ rest, token, pedido, produtosFiscais, ref, forma, cpf, notaId, numeroDemo }) {
  const corpo = corpoNota(rest, pedido, produtosFiscais, forma, cpf);
  if (config.fiscalProvedor === 'demo') {
    const chave = '35' + new Date().toISOString().slice(2, 7).replace('-', '') + '00000000000000' + '65' + '001' + String(numeroDemo).padStart(9, '0') + '1' + crypto.randomInt(10000000, 99999999) + '0';
    return { status: 'autorizada', chave: chave.slice(0, 44).padEnd(44, '0'), numero: numeroDemo, serie: 1, urlDanfe: '/nfce/demo/' + notaId, urlXml: null, mensagem: 'Autorizada em modo de demonstração (sem valor fiscal).', valor: Number(corpo.valor_total) };
  }
  const amb = (rest.fiscal || {}).ambiente === 'producao' ? 'producao' : 'homologacao';
  const { http, d } = await focus('POST', amb, '/v2/nfce?ref=' + encodeURIComponent(ref), token, corpo);
  if (http >= 500) throw new ErroApp(502, 'O emissor de notas está fora do ar. Tente de novo em instantes.');
  return Object.assign(lerFocus(amb, d), { valor: Number(corpo.valor_total) });
}
async function consultar({ rest, token, ref }) {
  if (config.fiscalProvedor === 'demo') return null;
  const amb = (rest.fiscal || {}).ambiente === 'producao' ? 'producao' : 'homologacao';
  const { d } = await focus('GET', amb, '/v2/nfce/' + encodeURIComponent(ref), token);
  return lerFocus(amb, d);
}
async function cancelar({ rest, token, ref, justificativa }) {
  if (config.fiscalProvedor === 'demo') return { status: 'cancelada', mensagem: 'Cancelada em modo de demonstração.' };
  const amb = (rest.fiscal || {}).ambiente === 'producao' ? 'producao' : 'homologacao';
  const { d } = await focus('DELETE', amb, '/v2/nfce/' + encodeURIComponent(ref), token, { justificativa });
  const st = d.status === 'cancelado' ? 'cancelada' : null;
  return { status: st, mensagem: d.mensagem_sefaz || d.mensagem || '' };
}

module.exports = { FORMAS, FORMA_PADRAO, ativo, provedorNome, pendencias, emitir, consultar, cancelar, corpoNota };
