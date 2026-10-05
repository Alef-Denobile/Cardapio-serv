const crypto = require('crypto');

class ErroApp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// Envolve rotas async para que erros cheguem ao tratador central
const rota = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const texto = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const numero = (v, padrao = 0) => { const t = String(v == null ? '' : v).trim(); if (!t) return padrao; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const centavos = v => Math.round(v * 100) / 100;

const uuidValido = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

// CPF: confere os dois dígitos verificadores (não prova que o CPF é da pessoa, só que é um número possível)
function cpfValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    if ((s * 10) % 11 % 10 !== Number(d[n])) return false;
  }
  return true;
}
const soDigitos = v => String(v || '').replace(/\D/g, '');
const mascararCpf = d => d && d.length === 11 ? '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**' : '';

function tokenAleatorio(bytes = 9) { return crypto.randomBytes(bytes).toString('base64url'); }

function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function minutosLocais(fuso) {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: fuso || 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = Number(partes.find(p => p.type === 'hour').value) % 24, m = Number(partes.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

function inicioDoDia(fuso) {
  const d = new Date();
  return new Date(d.getTime() - (minutosLocais(fuso) * 60 + d.getSeconds()) * 1000 - d.getMilliseconds());
}

function estaAberto(r) {
  const p = t => { const [h, m] = String(t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
  const a = p(r.abre), f = p(r.fecha), agora = minutosLocais(r.fuso);
  if (a === f) return true; // 24 horas
  return a < f ? (agora >= a && agora < f) : (agora >= a || agora < f);
}

// Dados do pedido que o cliente pode ver (sem dados internos do restaurante)
function pedidoParaCliente(p) {
  return {
    id: p.id, numero: p.numero, tipo: p.tipo, mesa: p.mesa, status: p.status,
    cliente: { nome: p.cliente && p.cliente.nome },
    entrega: p.tipo === 'delivery' ? p.entrega : undefined,
    linhas: p.linhas.map(l => ({ nome: l.nome, qtd: l.qtd, unit: l.unit, opcoes: l.opcoes })),
    obs: p.obs, subtotal: p.subtotal, servico: p.servico, taxaEntrega: p.taxaEntrega, total: p.total,
    pagamento: p.pagamento, entregador: p.entregador && p.entregador.nome ? { nome: p.entregador.nome } : undefined,
    historico: p.historico, criadoEm: p.createdAt
  };
}

module.exports = { cpfValido, soDigitos, mascararCpf, uuidValido, ErroApp, rota, texto, numero, centavos, tokenAleatorio, iguais, estaAberto, inicioDoDia, minutosLocais, pedidoParaCliente };
