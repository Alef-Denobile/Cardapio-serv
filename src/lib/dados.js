// Limpeza e validação dos dados que chegam do painel do dono e da área de devs.
const { ErroApp, texto, numero, centavos } = require('./util');

function limparProduto(b) {
  const nome = texto(b.nome, 80), categoria = texto(b.categoria, 60), preco = centavos(numero(b.preco, -1));
  if (!nome) throw new ErroApp(400, 'Dê um nome ao produto.');
  if (!categoria) throw new ErroApp(400, 'Escolha a categoria do produto.');
  if (!(preco >= 0)) throw new ErroApp(400, 'Informe um preço válido, por exemplo 39.90.');
  const opcoes = (Array.isArray(b.opcoes) ? b.opcoes : []).slice(0, 10).map(o => ({
    nome: texto(o.nome, 60), tipo: o.tipo === 'varios' ? 'varios' : 'um',
    escolhas: (Array.isArray(o.escolhas) ? o.escolhas : []).slice(0, 30).map(e => ({ nome: texto(e.nome, 60), preco: centavos(Math.max(0, numero(e.preco, 0))) })).filter(e => e.nome)
  })).filter(o => o.nome && o.escolhas.length);
  const selos = (Array.isArray(b.selos) ? b.selos : []).map(s => texto(s, 30)).filter(Boolean).slice(0, 6);
  return { nome, categoria, preco, descricao: texto(b.descricao, 240), selos, opcoes, fotoUrl: texto(b.fotoUrl, 500), esgotado: !!b.esgotado, destaque: !!b.destaque };
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
  Object.keys(mud).forEach(k => mud[k] === undefined && delete mud[k]);
  return mud;
}

module.exports = { limparProduto, limparConfig };
