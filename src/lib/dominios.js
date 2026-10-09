// Domínio próprio por restaurante (função extra "dominio", para o plano mais caro).
// Com o domínio configurado (ex.: pizzariadoze.com.br), o mesmo servidor responde:
//   https://pizzariadoze.com.br/          -> site do restaurante (pedido online)
//   https://pizzariadoze.com.br/salao     -> cardápio do salão
//   https://pizzariadoze.com.br/mesa/5    -> mesa (QR Code)
//   https://pizzariadoze.com.br/totem     -> totem
// O restante (/api, /js, /painel, /termos...) funciona igual. O domínio precisa ser adicionado na hospedagem
// (no Render: Settings > Custom Domains) e apontado no DNS (CNAME para o endereço do serviço).
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { sistema } = require('../db');
const config = require('../config');

let mapa = new Map(), carregadoEm = 0;
async function atualizar() {
  try {
    const rows = await sistema(async c => (await c.query('SELECT dominio, slug FROM restaurantes WHERE dominio IS NOT NULL AND ativo AND rec_dominio')).rows);
    mapa = new Map(rows.flatMap(r => [[r.dominio, r.slug], ['www.' + r.dominio, r.slug]]));
    carregadoEm = Date.now();
  } catch (e) { console.error('Domínios próprios:', e.message); }
}
const limpar = () => { carregadoEm = 0; };
async function slugDoHost(host) {
  if (Date.now() - carregadoEm > 60000) await atualizar();
  return mapa.get(String(host || '').toLowerCase().replace(/:\d+$/, '')) || null;
}

// "https://www.PizzariaDoZe.com.br/qualquer" -> "pizzariadoze.com.br" (com www, se veio com www)
function normalizar(v) {
  // guarda sem o "www.": o site responde nos dois (pizzariadoze.com.br e www.pizzariadoze.com.br)
  return String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
}
const valido = d => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 120;

// Confere se o DNS já aponta para o servidor (CNAME para DOMINIO_ALVO, ou mesmo IP)
async function verificar(dominio) {
  const alvo = config.dominioAlvo || (config.urlPublica ? new URL(config.urlPublica).hostname : '');
  const out = { dominio, alvo, cname: [], ips: [], ok: false };
  try { out.cname = await dns.resolveCname(dominio); } catch (e) {}
  try { out.ips = await dns.resolve4(dominio); } catch (e) {}
  if (alvo && out.cname.some(c => c.replace(/\.$/, '').toLowerCase() === alvo)) out.ok = true;
  else if (alvo && out.ips.length) { try { const ia = await dns.resolve4(alvo); out.ok = out.ips.some(i => ia.includes(i)); } catch (e) {} }
  out.mensagem = out.ok ? 'O domínio já aponta para o servidor.' : !out.cname.length && !out.ips.length ? 'O domínio ainda não aponta para lugar nenhum (pode levar algumas horas depois de mexer no DNS).' : 'O domínio aponta para outro lugar' + (out.cname[0] ? ' (' + out.cname[0] + ')' : out.ips[0] ? ' (' + out.ips[0] + ')' : '') + '.';
  return out;
}

// Serve as telas no domínio próprio, já dizendo qual é o restaurante (meta "restaurante")
const pub = path.join(__dirname, '..', '..', 'public'), cache = new Map();
function pagina(arq, slug) {
  if (!cache.has(arq) || !config.producao) cache.set(arq, fs.readFileSync(path.join(pub, arq), 'utf8'));
  return cache.get(arq).replace('<head>', '<head>\n<meta name="restaurante" content="' + slug.replace(/[^a-z0-9-]/g, '') + '">');
}
const ROTAS = [[/^\/$/, 'index.html'], [/^\/salao\/?$/, 'salao.html'], [/^\/mesa\/\d+\/?$/, 'salao.html'], [/^\/totem\/?$/, 'totem.html']];
function middleware() {
  return async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || /\.\w+$/.test(req.path)) return next();
    const rota = ROTAS.find(r => r[0].test(req.path)); if (!rota) return next();
    try {
      const slug = await slugDoHost(req.hostname); if (!slug) return next();
      res.set('Cache-Control', 'no-cache'); if (rota[1] === 'totem.html') res.set('X-Robots-Tag', 'noindex');
      res.type('html').send(pagina(rota[1], slug));
    } catch (e) { next(); }
  };
}

// Endereços da própria plataforma (não podem virar domínio de restaurante)
function daPlataforma(d) {
  const hosts = [config.dominioAlvo, config.urlPublica, process.env.RENDER_EXTERNAL_URL, process.env.PUBLIC_URL].filter(Boolean).map(x => normalizar(x));
  return hosts.includes(d) || /(^|\.)onrender\.com$|^localhost$/.test(d);
}

module.exports = { daPlataforma, middleware, slugDoHost, atualizar, limpar, normalizar, valido, verificar };
