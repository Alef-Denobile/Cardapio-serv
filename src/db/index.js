// Conexão com o PostgreSQL e as duas formas de abrir uma transação:
//   doRestaurante(id, fn): a sessão só enxerga os dados desse restaurante (Row Level Security)
//   sistema(fn): usado só no login, na área de devs e nos scripts, enxerga todos
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('../config');

// numeric e bigint chegam como texto por padrão: convertemos para número
types.setTypeParser(1700, v => v === null ? null : parseFloat(v));
types.setTypeParser(20, v => v === null ? null : parseInt(v, 10));

function precisaSsl(url) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return true;
  if (/sslmode=(require|verify)/.test(url)) return true;
  try { const h = new URL(url).hostname; return h !== 'localhost' && h !== '127.0.0.1' && h.includes('.'); } catch (e) { return false; }
}

function limparUrl(url) {
  try { const u = new URL(url); u.searchParams.delete('sslmode'); u.searchParams.delete('channel_binding'); return u.toString(); }
  catch (e) { return url; }
}

const pool = new Pool({
  // sslmode e channel_binding (que o Neon coloca no endereço) são tratados aqui, não pelo driver
  connectionString: limparUrl(config.databaseUrl),
  connectionTimeoutMillis: 15000, // bancos gratuitos que "dormem" (Neon) levam alguns segundos para acordar
  ssl: precisaSsl(config.databaseUrl) ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DATABASE_POOL || 10),
  idleTimeoutMillis: 30000
});
pool.on('error', e => console.error('Erro na conexão com o banco:', e.message));

async function transacao(ctx, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (ctx.sistema) await c.query("SELECT set_config('app.sistema', 'on', true)");
    if (ctx.rid) await c.query("SELECT set_config('app.restaurante_id', $1, true)", [String(ctx.rid)]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}
const doRestaurante = (rid, fn) => transacao({ rid }, fn);
const sistema = fn => transacao({ sistema: true }, fn);

// Aplica as migrações da pasta migracoes/ que ainda não rodaram
async function migrar() {
  const c = await pool.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS schema_migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())');
    await c.query('SELECT pg_advisory_lock(728311)');
    const feitas = new Set((await c.query('SELECT nome FROM schema_migracoes')).rows.map(r => r.nome));
    const dir = path.join(__dirname, 'migracoes');
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
      if (feitas.has(f)) continue;
      await c.query('BEGIN');
      try { await c.query(fs.readFileSync(path.join(dir, f), 'utf8')); await c.query('INSERT INTO schema_migracoes (nome) VALUES ($1)', [f]); await c.query('COMMIT'); console.log('Migração aplicada:', f); }
      catch (e) { await c.query('ROLLBACK'); throw new Error('Falha na migração ' + f + ': ' + e.message); }
    }
    const papel = (await c.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
    if (papel && (papel.rolsuper || papel.rolbypassrls)) console.warn('ATENÇÃO: o usuário do banco é superusuário ou ignora o Row Level Security. Use um usuário comum para que o isolamento entre restaurantes funcione no próprio banco.');
  } finally { await c.query('SELECT pg_advisory_unlock(728311)').catch(() => {}); c.release(); }
}

async function conectar() {
  await pool.query('SELECT 1');
  await migrar();
  console.log('Banco de dados conectado.');
}
const encerrar = () => pool.end();

module.exports = { pool, doRestaurante, sistema, conectar, migrar, encerrar };
