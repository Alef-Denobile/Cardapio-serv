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
      'connect-src': ["'self'", 'ws:', 'wss:']
    }
  }
}));
app.use(express.json({ limit: '100kb' }));

app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/publico'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/painel', require('./routes/painel'));
app.use('/api/painel', require('./routes/relatorios'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/vitrine', require('./routes/vitrine'));
if (config.clienteContas) app.use('/api/clientes', require('./routes/clientes').router);
app.use('/api/pagamentos', require('./routes/pagamentos').router);
app.get('/api/suporte', (req, res) => res.json({ whatsapp: config.suporteWhatsapp, email: config.suporteEmail }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Endereço da API não encontrado.' }));

// Páginas
const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { extensions: ['html'], maxAge: config.producao ? '1h' : 0 }));
app.get(['/r/:slug', '/r/:slug/mesa/:numero'], (req, res) => res.sendFile(path.join(pub, 'cardapio.html')));
app.get('/pagar/:id', (req, res) => { res.set('X-Robots-Tag', 'noindex'); res.sendFile(path.join(pub, 'pagar.html')); });
app.get('/painel', (req, res) => res.sendFile(path.join(pub, 'painel.html')));
app.get('/admin', (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.sendFile(path.join(pub, 'admin.html')); });

// Erros
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados enviados em formato inválido.' });
  // Erros do PostgreSQL: regras do banco recusaram a operação
  if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esses dados.' });
  if (['23514', '23502', '22P02', '22001', '23503'].includes(err.code)) return res.status(400).json({ erro: 'Dados inválidos: confira os campos e tente de novo.' });
  if (err.code === '42501') { console.error('Bloqueio do Row Level Security:', err.message); return res.status(403).json({ erro: 'Acesso negado.' }); }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: status >= 500 ? 'Erro no servidor. Tente de novo em instantes.' : err.message });
});

async function iniciar() {
  await conectar();
  const servidor = http.createServer(app);
  realtime.iniciar(servidor);
  require('./routes/pagamentos').iniciarLimpeza();
  servidor.listen(config.porta, () => console.log(`Servidor no ar em http://localhost:${config.porta}`));
}

iniciar().catch(e => { console.error('Não foi possível iniciar:', e.message); process.exit(1); });
