// Limpeza e validação dos dados que chegam do painel do dono e da área de devs.
const { ErroApp, texto, numero, centavos, cnpjValido, coordValida } = require('./util');

function limparProduto(b) {
  const nome = texto(b.nome, 80), categoria = texto(b.categoria, 60), preco = centavos(numero(b.preco, -1));
  if (!nome) throw new ErroApp(400, 'Dê um nome ao produto.');
  if (!categoria) throw new ErroApp(400, 'Escolha a categoria do produto.');
  if (!(preco >= 0)) throw new ErroApp(400, 'Informe um preço válido, por exemplo 39.90.');
  const opcoes = (Array.isArray(b.opcoes) ? b.opcoes : []).slice(0, 10).map(o => {
    // combo e meio a meio: as escolhas vêm de outra categoria do cardápio
    if (o.tipo === 'combo') return { nome: texto(o.nome, 60) || 'Escolha', tipo: 'combo', categoria: texto(o.categoria, 60), qtd: Math.max(1, Math.min(5, Math.trunc(numero(o.qtd, 1)))), escolhas: [] };
    if (o.tipo === 'sabores') return { nome: texto(o.nome, 60) || 'Sabores', tipo: 'sabores', categoria: texto(o.categoria, 60), max: Math.max(2, Math.min(4, Math.trunc(numero(o.max, 2)))), regra: o.regra === 'media' ? 'media' : 'maior', escolhas: [] };
    return { nome: texto(o.nome, 60), tipo: o.tipo === 'varios' ? 'varios' : 'um',
      escolhas: (Array.isArray(o.escolhas) ? o.escolhas : []).slice(0, 30).map(e => ({ nome: texto(e.nome, 60), preco: centavos(Math.max(0, numero(e.preco, 0))) })).filter(e => e.nome) };
  }).filter(o => o.nome && (o.tipo === 'combo' || o.tipo === 'sabores' ? o.categoria : o.escolhas.length));
  if (opcoes.some(o => (o.tipo === 'combo' || o.tipo === 'sabores') && o.categoria === categoria)) throw new ErroApp(400, 'O combo ou meio a meio precisa buscar os itens de outra categoria (ex.: produto em "Combos", sabores em "Pizzas").');
  if (opcoes.filter(o => o.tipo === 'sabores').length > 1) throw new ErroApp(400, 'Use só um grupo de sabores por produto.');
  const selos = (Array.isArray(b.selos) ? b.selos : []).map(s => texto(s, 30)).filter(Boolean).slice(0, 6);
  const f = b.fiscal || {}, fiscal = {};
  const ncm = String(f.ncm || '').replace(/\D/g, ''), cfop = String(f.cfop || '').replace(/\D/g, ''), csosn = String(f.csosn || '').replace(/\D/g, '');
  if (ncm) { if (ncm.length !== 8) throw new ErroApp(400, 'O NCM tem 8 números (ex.: 2106.90.90).'); fiscal.ncm = ncm; }
  if (cfop) { if (cfop.length !== 4) throw new ErroApp(400, 'O CFOP tem 4 números (ex.: 5102).'); fiscal.cfop = cfop; }
  if (csosn) { if (csosn.length !== 3) throw new ErroApp(400, 'O CSOSN tem 3 números (ex.: 102).'); fiscal.csosn = csosn; }
  // produtos por horário: só muda se o campo vier (a área de devs não mexe nele)
  const disponibilidade = 'disponibilidade' in b ? require('./horarios').limpar(b.disponibilidade) : undefined;
  return { nome, categoria, preco, descricao: texto(b.descricao, 240), selos, opcoes, fotoUrl: texto(b.fotoUrl, 500), esgotado: !!b.esgotado, destaque: !!b.destaque, sugerir: !!b.sugerir, fiscal, disponibilidade };
}

function limparConfig(b) {
  b = b || {}; const d = b.delivery || {};
  const hora = v => /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : undefined;
  const cor = /^#[0-9a-fA-F]{6}$/.test(String(b.cor)) ? String(b.cor) : undefined;
  const mud = {
    categoriaVitrine: b.categoriaVitrine === undefined ? undefined : texto(b.categoriaVitrine, 40), capaUrl: b.capaUrl === undefined ? undefined : texto(b.capaUrl, 500), sobre: b.sobre === undefined ? undefined : texto(b.sobre, 400),
    nome: texto(b.nome, 80) || undefined, frase: texto(b.frase, 120), cor, logoUrl: texto(b.logoUrl, 500), whatsapp: texto(b.whatsapp, 20), chavePix: texto(b.chavePix, 120),
    abre: hora(b.abre), fecha: hora(b.fecha), aceitarForaDoHorario: !!b.aceitarForaDoHorario,
    taxaServico: Math.min(30, Math.max(0, numero(b.taxaServico, 10))),
    categorias: Array.isArray(b.categorias) ? b.categorias.map(c => texto(c, 60)).filter(Boolean).slice(0, 40) : undefined,
    delivery: {
      ativo: !!d.ativo, tempo: texto(d.tempo, 30), tempoRetirada: texto(d.tempoRetirada, 30),
      pedidoMinimo: Math.max(0, numero(d.pedidoMinimo, 0)), gratisAcimaDe: Math.max(0, numero(d.gratisAcimaDe, 0)),
      bairros: (Array.isArray(d.bairros) ? d.bairros : []).slice(0, 80).map(x => ({ nome: texto(x.nome, 60), taxa: centavos(Math.max(0, numero(x.taxa, 0))) })).filter(x => x.nome)
    }
  };
  // Taxa por distância
  if (d.modo !== undefined) mud.delivery.modo = d.modo === 'distancia' ? 'distancia' : 'bairro';
  if (d.local !== undefined) {
    const lat = numero(d.local && d.local.lat, NaN), lng = numero(d.local && d.local.lng, NaN);
    mud.delivery.local = coordValida(lat, lng) ? { lat, lng, endereco: texto(d.local.endereco, 160) } : { lat: null, lng: null, endereco: texto(d.local && d.local.endereco, 160) };
  }
  if (d.faixas !== undefined) {
    const vistas = new Set();
    mud.delivery.faixas = (Array.isArray(d.faixas) ? d.faixas : []).slice(0, 20)
      .map(x => ({ ate: Math.round(Math.min(100, Math.max(0, numero(x.ate, 0))) * 10) / 10, taxa: centavos(Math.max(0, numero(x.taxa, 0))) }))
      .filter(x => x.ate > 0 && !vistas.has(x.ate) && vistas.add(x.ate)).sort((a, b) => a.ate - b.ate);
  }
  if (mud.delivery.modo === 'distancia') {
    const loc = mud.delivery.local;
    if (loc && loc.lat == null) throw new ErroApp(400, 'Para cobrar por distância, marque no mapa onde fica o restaurante.');
    if (mud.delivery.faixas && !mud.delivery.faixas.length) throw new ErroApp(400, 'Informe ao menos uma faixa de distância (ex.: até 3 km | 5).');
  }
  // Pedido agendado
  if (b.agendamento !== undefined) {
    const a = b.agendamento || {};
    mud.agendamento = { ativo: !!a.ativo, antecedencia: Math.round(Math.min(1440, Math.max(15, numero(a.antecedencia, 60)))), dias: Math.round(Math.min(7, Math.max(0, numero(a.dias, 2)))), preparo: Math.round(Math.min(240, Math.max(10, numero(a.preparo, 45)))) };
  }
  // Dados fiscais (NFC-e). O token do emissor só é gravado quando vem preenchido (nunca volta para a tela).
  if (b.fiscal !== undefined) {
    const f = b.fiscal || {}, dig = (v, n) => String(v || '').replace(/\D/g, '').slice(0, n);
    const cnpj = dig(f.cnpj, 14);
    if (cnpj && !cnpjValido(cnpj)) throw new ErroApp(400, 'CNPJ inválido. Confira os números.');
    const ncm = dig(f.ncm, 8), cfop = dig(f.cfop, 4), csosn = dig(f.csosn, 3);
    if (ncm && ncm.length !== 8) throw new ErroApp(400, 'O NCM padrão tem 8 números.');
    mud.fiscal = { cnpj, ie: texto(f.ie, 20).replace(/[^0-9A-Za-z]/g, ''), razao: texto(f.razao, 80), regime: f.regime === '3' ? '3' : '1',
      ambiente: f.ambiente === 'producao' ? 'producao' : 'homologacao', auto: !!f.auto, ncm: ncm || '21069090', cfop: cfop.length === 4 ? cfop : '5102', csosn: csosn.length === 3 ? csosn : '102' };
  }
  if (typeof b.fiscalToken === 'string' && b.fiscalToken.trim()) mud.fiscalToken = texto(b.fiscalToken, 200);
  if (b.fiscalTokenApagar === true) mud.fiscalToken = '';
  Object.keys(mud).forEach(k => mud[k] === undefined && delete mud[k]);
  return mud;
}

module.exports = { limparProduto, limparConfig };
