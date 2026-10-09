const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { conectar } = require('./db');
const realtime = require('./realtime');

const app = express();
app.set('trust proxy', 1); // o Render fica na frente do servidor
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      // fora da produção não força https (para testar pelo celular na rede local)
      'upgrade-insecure-requests': config.producao ? [] : null
    }
  }
}));
// a importação de cardápio (lista grande) lê o corpo só depois do login de dev (veja src/routes/admin.js)
const jsonPadrao = express.json({ limit: '100kb' });
app.use((req, res, next) => /^\/api\/admin\/restaurantes\/[^/]+\/importar(\/ifood)?$/.test(req.path) ? next() : jsonPadrao(req, res, next));

app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/publico'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/senha', require('./routes/senha'));
app.use('/api/painel', require('./routes/painel'));
app.use('/api/painel', require('./routes/relatorios'));
app.use('/api/painel', require('./routes/estoque'));
app.use('/api/admin', require('./routes/admin'));
if (config.clienteContas) app.use('/api/clientes', require('./routes/clientes').router);
app.use('/api/pagamentos', require('./routes/pagamentos').router);
app.use('/api/pix', require('./routes/pix').router);
app.use('/api/faturas', require('./routes/faturas'));
app.get('/api/suporte', (req, res) => res.json({ whatsapp: config.suporteWhatsapp, email: config.suporteEmail }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Endereço da API não encontrado.' }));

// Fotos enviadas pelo painel e cupom de demonstração da NFC-e
app.use(require('./routes/arquivos'));
app.use(require('./routes/legal')); // /termos e /privacidade
// Mapa (Leaflet) servido pelo próprio servidor, sem depender de CDN
app.use('/vendor/leaflet', express.static(path.join(path.dirname(require.resolve('leaflet/package.json')), 'dist'), { maxAge: config.producao ? '7d' : 0 }));

// Páginas
const pub = path.join(__dirname, '..', 'public');
// Domínio próprio do restaurante (função extra): /, /salao, /mesa/N e /totem no endereço dele
app.use(require('./lib/dominios').middleware());
// Entrada do site: escolher entre pedir em casa e o menu do salão
app.get('/', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(pub, 'inicio.html')); });
// Telas (html, js, css): o navegador sempre confere se há versão nova (atualização aparece na hora depois do deploy).
// Imagens continuam guardadas por 1 hora.
app.use(express.static(pub, { extensions: ['html'], maxAge: config.producao ? '1h' : 0,
  setHeaders: (res, arq) => { if (/\.(html|js|css)$/.test(arq)) res.setHeader('Cache-Control', 'no-cache'); } }));
// Site do restaurante (cardápio, entrega e retirada) e, pelo QR Code, o pedido na mesa
app.get('/r/:slug', (req, res) => res.sendFile(path.join(pub, 'index.html')));
// Cardápio do salão (quem já está no restaurante): pela mesa (QR da mesa) ou só para ver (/salao)
app.get('/r/:slug/mesa/:numero', (req, res) => res.sendFile(path.join(pub, 'salao.html')));
app.get('/r/:slug/salao', (req, res) => res.sendFile(path.join(pub, 'salao.html')));
// Modo totem (autoatendimento no balcão): o link do painel leva o código secreto do totem
app.get('/r/:slug/totem', (req, res) => { res.set('X-Robots-Tag', 'noindex'); res.sendFile(path.join(pub, 'totem.html')); });
app.get('/pagar/:id', (req, res) => { res.set('X-Robots-Tag', 'noindex'); res.sendFile(path.join(pub, 'pagar.html')); });
app.get('/painel', (req, res) => res.sendFile(path.join(pub, 'painel.html')));
app.get('/fatura/:id', (req, res) => { res.set({ 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); res.sendFile(path.join(pub, 'fatura.html')); });
app.get('/redefinir-senha', (req, res) => { res.set({ 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); res.sendFile(path.join(pub, 'redefinir-senha.html')); });
app.get('/admin', (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.sendFile(path.join(pub, 'admin.html')); });

// Erros
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados enviados em formato inválido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo grande demais. Use uma foto de até 3 MB.' });
  // Erros do PostgreSQL: regras do banco recusaram a operação
  if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esses dados.' });
  if (['23514', '23502', '22P02', '22001', '23503'].includes(err.code)) return res.status(400).json({ erro: 'Dados inválidos: confira os campos e tente de novo.' });
  if (err.code === '42501') { console.error('Bloqueio do Row Level Security:', err.message); return res.status(403).json({ erro: 'Acesso negado.' }); }
  const status = err.status || 500;
  if (status >= 500 && !(err instanceof require('./lib/util').ErroApp)) console.error(err);
  // mensagens escritas para a pessoa (ErroApp) aparecem mesmo quando o problema é de um serviço de fora (502/503)
  const nossa = err instanceof require('./lib/util').ErroApp;
  res.status(status).json(Object.assign({ erro: status >= 500 && !nossa ? 'Erro no servidor. Tente de novo em instantes.' : err.message }, nossa && err.extra ? err.extra : {}));
});

async function iniciar() {
  await conectar();
  const servidor = http.createServer(app);
  realtime.iniciar(servidor);
  require('./routes/pagamentos').iniciarLimpeza();
  require('./routes/pix').iniciarConferencia(); // Pix automático: confere os pendentes a cada 20 s
  require('./lib/carrinho').iniciar(); // lembrete de carrinho no WhatsApp (função extra)
  require('./lib/cobranca').iniciar(); // mensalidade: gera faturas, suspende e reativa (a cada hora)
  servidor.listen(config.porta, () => console.log(`Servidor no ar em http://localhost:${config.porta}`));
}

iniciar().catch(e => { console.error('Não foi possível iniciar:', e.message); process.exit(1); });
