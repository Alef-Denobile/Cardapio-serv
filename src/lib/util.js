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
    historico: p.historico, criadoEm: p.createdAt, agendadoPara: p.agendadoPara || null, origem: p.origem, consumo: p.consumo
  };
}

// CNPJ: confere os dígitos verificadores
function cnpjValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += Number(d[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

// Partes da data/hora no fuso do restaurante
function partesLocais(data, fuso) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: fuso || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(data);
  const g = t => Number(p.find(x => x.type === t).value);
  return { ano: g('year'), mes: g('month'), dia: g('day'), hora: g('hour') % 24, min: g('minute') };
}
// "2026-10-07" + "19:30" no fuso do restaurante -> Date (UTC)
function localParaData(ano, mes, dia, minutos, fuso) {
  const palpite = Date.UTC(ano, mes - 1, dia, 0, minutos);
  const l = partesLocais(new Date(palpite), fuso);
  const comoUtc = Date.UTC(l.ano, l.mes - 1, l.dia, l.hora, l.min);
  return new Date(palpite - (comoUtc - palpite));
}
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
// Horários que o cliente pode escolher para um pedido agendado (de 30 em 30 minutos, dentro do horário de funcionamento)
function horariosAgendamento(r, agora = new Date()) {
  const a = r.agendamento || {};
  if (!a.ativo) return [];
  const min = t => { const [h, m] = String(t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
  const abre = min(r.abre); let fecha = min(r.fecha); if (fecha <= abre) fecha += 24 * 60;
  const limite = agora.getTime() + (a.antecedencia || 60) * 60000, hoje = partesLocais(agora, r.fuso), dias = [];
  for (let d = 0; d <= (a.dias == null ? 2 : a.dias); d++) {
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + d, 12));
    const ano = base.getUTCFullYear(), mes = base.getUTCMonth() + 1, dia = base.getUTCDate();
    const horarios = [];
    // começa 30 min depois de abrir (dá tempo de a cozinha preparar) e vai até o fechamento
    for (let m = Math.ceil((abre + 30) / 30) * 30; m <= fecha; m += 30) {
      const quando = localParaData(ano, mes, dia, m, r.fuso);
      if (quando.getTime() >= limite) horarios.push({ hora: String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'), em: quando.toISOString() });
    }
    if (horarios.length) dias.push({ data: ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0'), rotulo: d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : DIAS_SEMANA[base.getUTCDay()] + ', ' + String(dia).padStart(2, '0') + '/' + String(mes).padStart(2, '0'), horarios });
  }
  return dias;
}

// Distância em linha reta entre dois pontos (km)
function distanciaKm(a, b) {
  const rad = x => x * Math.PI / 180, R = 6371;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const coordValida = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// Endereço público do site para montar links (e-mails, webhooks). Sem PUBLIC_URL, só confia no Host fora da produção.
function urlBase(req) {
  const config = require('../config');
  if (config.urlPublica) return config.urlPublica;
  if (!config.producao && req) return req.protocol + '://' + req.get('host');
  return '';
}
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

module.exports = { urlBase, hashToken, cnpjValido, partesLocais, localParaData, horariosAgendamento, distanciaKm, coordValida, cpfValido, soDigitos, mascararCpf, uuidValido, ErroApp, rota, texto, numero, centavos, tokenAleatorio, iguais, estaAberto, inicioDoDia, minutosLocais, pedidoParaCliente };
