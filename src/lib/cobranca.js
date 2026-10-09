// Mensalidade dos restaurantes (o que a plataforma cobra de cada restaurante).
// - A equipe de devs define, por restaurante: valor, dia do vencimento e dias de tolerância.
// - 7 dias antes do vencimento a fatura do mês é criada e o dono recebe o link por e-mail.
// - O dono paga por Pix (conta da plataforma no Mercado Pago, ou "demo") pela página da fatura,
//   que funciona mesmo com o painel suspenso. Os devs também podem dar baixa manual (dinheiro, transferência).
// - Passou o vencimento + tolerância sem pagar: o restaurante é suspenso sozinho (nada é apagado).
//   Assim que paga, volta sozinho.
const crypto = require('crypto');
const config = require('../config');
const { sistema } = require('../db');
const email = require('./email');
const pix = require('./pix');
const { ErroApp } = require('./util');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesTxt = d => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); return MESES[x.getUTCMonth()] + ' de ' + x.getUTCFullYear(); };
const dataTxt = d => String(d).slice(0, 10).split('-').reverse().join('/');
const brl = v => 'R$ ' + (+v || 0).toFixed(2).replace('.', ',');
const baseSite = () => config.urlPublica || (config.producao ? '' : 'http://localhost:' + config.porta);
const linkFatura = (f, base) => (base || baseSite()) + '/fatura/' + f.id + '?c=' + encodeURIComponent(f.codigo);

function faturaObj(f) {
  return { id: f.id, competencia: String(f.competencia).slice(0, 10), mes: mesTxt(f.competencia), valor: Number(f.valor), vencimento: String(f.vencimento).slice(0, 10),
    status: f.status, pagoEm: f.pago_em, forma: f.forma || '', obs: f.obs || '', atrasada: f.status === 'aberta' && f.atrasada === true, codigo: f.codigo, criadoEm: f.criado_em };
}

// Linha da fatura com a data de hoje no fuso do restaurante
const SELECT_F = `SELECT f.*, (f.status = 'aberta' AND (now() AT TIME ZONE r.fuso)::date > f.vencimento) AS atrasada
  FROM faturas f JOIN restaurantes r ON r.id = f.restaurante_id`;

async function donosDe(c, rid) { return (await c.query("SELECT nome, email FROM usuarios WHERE restaurante_id = $1 AND papel = 'dono' AND ativo", [rid])).rows; }
async function avisarDonos(c, rest, f, tipo) {
  if (!baseSite()) { console.error('Mensalidade: defina PUBLIC_URL para mandar o link da fatura por e-mail.'); return; }
  const link = linkFatura(f);
  for (const d of await donosDe(c, rest.id)) {
    const linhas = tipo === 'suspenso'
      ? ['A mensalidade de ' + mesTxt(f.competencia) + ' (' + brl(f.valor) + ') venceu em ' + dataTxt(f.vencimento) + ' e o acesso do ' + rest.nome + ' foi suspenso.', 'Nenhum dado foi apagado. Assim que o Pix cair, o cardápio e o painel voltam sozinhos.']
      : ['A mensalidade de ' + mesTxt(f.competencia) + ' do ' + rest.nome + ' já está disponível: ' + brl(f.valor) + ', com vencimento em ' + dataTxt(f.vencimento) + '.', 'Você pode pagar por Pix pelo link abaixo. A confirmação é automática.'];
    email.enviar({ para: d.email, assunto: tipo === 'suspenso' ? 'Acesso suspenso: mensalidade em atraso' : 'Mensalidade de ' + mesTxt(f.competencia), titulo: 'Olá, ' + String(d.nome).split(' ')[0] + '!', linhas, botao: 'Ver e pagar a fatura', link,
      rodape: 'Mensalidade da plataforma ' + config.plataforma.nome + '.' });
  }
}

// Cria a fatura do próximo vencimento quando faltam 7 dias ou menos (ex.: vence dia 5 -> criada no dia 28 do mês anterior).
// - A primeira cobrança de um restaurante ligado depois do dia do vencimento começa no mês seguinte (não cobra o mês já passado).
// - Se a rotina ficou parada e a fatura do mês não foi criada, cria com 3 dias para pagar.
// forcar (botão dos devs): cria já a fatura do mês atual.
const iso = d => d.toISOString().slice(0, 10);
const somaDias = (d, n) => iso(new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000));
function vencDe(ano, mes, dia) { return iso(new Date(Date.UTC(ano, mes, dia, 12))); } // mes 0-11 (mês 12 vira janeiro do ano seguinte)
async function gerarFatura(c, rest, forcar) {
  const cb = rest.cobranca || {};
  if (!cb.ativa || !(cb.valor > 0)) return null;
  const dia = Math.min(28, Math.max(1, Math.trunc(cb.dia || 10)));
  const hoje = String((await c.query('SELECT (now() AT TIME ZONE $1)::date AS d', [rest.fuso])).rows[0].d).slice(0, 10);
  const [a, m] = hoje.split('-').map(Number);
  const existentes = new Set((await c.query('SELECT competencia FROM faturas WHERE restaurante_id = $1', [rest.id])).rows.map(x => String(x.competencia).slice(0, 10)));
  const candidatos = [{ comp: vencDe(a, m - 1, 1), venc: vencDe(a, m - 1, dia) }, { comp: vencDe(a, m, 1), venc: vencDe(a, m, dia) }];
  let alvo = null;
  if (forcar) alvo = { comp: candidatos[0].comp, venc: candidatos[0].venc < hoje ? somaDias(hoje, 3) : candidatos[0].venc };
  else {
    for (const k of candidatos) {
      if (existentes.has(k.comp)) continue;
      const falta = (new Date(k.venc) - new Date(hoje)) / 86400000;
      if (falta >= 0 && falta <= 7) { alvo = k; break; }
      // vencimento deste mês já passou e a fatura não existe: só cria se o restaurante já tinha faturas antes (rotina atrasada)
      if (falta < 0 && k === candidatos[0] && existentes.size) { alvo = { comp: k.comp, venc: somaDias(hoje, 3) }; break; }
    }
  }
  if (!alvo || existentes.has(alvo.comp)) return null;
  const f = (await c.query(`INSERT INTO faturas (restaurante_id, competencia, valor, vencimento, codigo) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (restaurante_id, competencia) DO NOTHING RETURNING *`, [rest.id, alvo.comp, cb.valor, alvo.venc, crypto.randomBytes(18).toString('base64url')])).rows[0];
  if (f) { await avisarDonos(c, rest, f, 'nova'); await c.query('UPDATE faturas SET avisada_em = now() WHERE id = $1', [f.id]); }
  return f || null;
}

// Suspende quem passou do vencimento + tolerância; reativa quem pagou
async function ajustarSituacao(c, rest) {
  const tol = Math.max(0, Math.trunc((rest.cobranca || {}).tolerancia == null ? 5 : rest.cobranca.tolerancia));
  const atraso = (await c.query(`${SELECT_F} WHERE f.restaurante_id = $1 AND f.status = 'aberta' AND (now() AT TIME ZONE r.fuso)::date > f.vencimento + $2::int ORDER BY f.vencimento LIMIT 1`, [rest.id, tol])).rows[0];
  // carência dada pelos devs ao reativar manualmente (não suspende de novo até essa data)
  const carencia = (rest.cobranca || {}).carenciaAte;
  const ativa = !!(rest.cobranca || {}).ativa && !(carencia && new Date(carencia) > new Date());
  if (atraso && ativa && rest.ativo) {
    await c.query("UPDATE restaurantes SET ativo = false, suspenso_cobranca = true, motivo_suspensao = $2 WHERE id = $1", [rest.id, 'Mensalidade em atraso (' + mesTxt(atraso.competencia) + ')']);
    await c.query('INSERT INTO auditoria (restaurante_id, restaurante_nome, admin_id, admin_nome, acao, detalhe) VALUES ($1, $2, NULL, $3, $4, $5)',
      [rest.id, rest.nome, 'Sistema', 'Suspenso por atraso', 'Fatura de ' + mesTxt(atraso.competencia) + ' (' + brl(atraso.valor) + ') venceu em ' + dataTxt(atraso.vencimento)]);
    await avisarDonos(c, rest, atraso, 'suspenso');
    return 'suspenso';
  }
  if ((!atraso || !ativa) && !rest.ativo && rest.suspensoCobranca) {
    await c.query("UPDATE restaurantes SET ativo = true, suspenso_cobranca = false, motivo_suspensao = '' WHERE id = $1", [rest.id]);
    await c.query('INSERT INTO auditoria (restaurante_id, restaurante_nome, admin_id, admin_nome, acao, detalhe) VALUES ($1, $2, NULL, $3, $4, $5)', [rest.id, rest.nome, 'Sistema', 'Reativado', 'Mensalidade em dia']);
    return 'reativado';
  }
  return null;
}

// Baixa da fatura (Pix confirmado ou manual pelos devs) e reativação automática
async function darBaixa(fid, forma, obs) {
  return sistema(async c => {
    const f = (await c.query("UPDATE faturas SET status = 'paga', pago_em = now(), forma = $2, obs = CASE WHEN $3 = '' THEN obs ELSE $3 END WHERE id = $1 AND status = 'aberta' RETURNING *", [fid, forma, obs || ''])).rows[0];
    if (!f) return null;
    const rest = await require('./repo').carregarRest(c, f.restaurante_id);
    const situacao = await ajustarSituacao(c, rest);
    return { fatura: f, situacao };
  });
}

/* ---------- Pix da fatura (conta da plataforma) ---------- */
async function pixDaFatura(f, restNome) {
  // trava a fatura: dois aparelhos abrindo ao mesmo tempo recebem o MESMO Pix.
  // Um Pix novo só é criado depois que o anterior venceu (assim nenhum pagamento fica "perdido" num código antigo).
  return sistema(async c => {
    const atual = (await c.query('SELECT * FROM faturas WHERE id = $1 FOR UPDATE', [f.id])).rows[0];
    if (atual.status !== 'aberta') throw new ErroApp(409, atual.status === 'paga' ? 'Esta fatura já está paga.' : 'Esta fatura foi cancelada.');
    if (atual.pix_qr && atual.pix_expira && new Date(atual.pix_expira) > new Date()) return { qr: atual.pix_qr, expira: atual.pix_expira, demo: /^demo-/.test(atual.pix_ref || '') };
    const venceEm = new Date(Date.now() + 24 * 3600000);
    let ref, qr;
    if (config.cobranca.provedor === 'mercadopago') {
      if (!config.cobranca.mpToken) throw new ErroApp(422, 'Pagamento por Pix indisponível agora. Fale com o suporte.');
      const d = await pix.mp(config.cobranca.mpToken, 'POST', '/v1/payments', { transaction_amount: Number(atual.valor), payment_method_id: 'pix', description: ('Mensalidade ' + mesTxt(atual.competencia) + ' · ' + restNome).slice(0, 200),
        external_reference: 'fatura:' + atual.id, payer: { email: config.cobranca.email || 'financeiro@' + (config.urlPublica ? new URL(config.urlPublica).hostname : 'cardapio.app') },
        date_of_expiration: pix.dataMp(venceEm), notification_url: config.urlPublica && /^https:/.test(config.urlPublica) ? config.urlPublica + '/api/faturas/webhook' : undefined }, 'fatura-' + atual.id + '-' + (atual.pix_ref || 'primeiro'));
      const td = (d.point_of_interaction && d.point_of_interaction.transaction_data) || {};
      if (!td.qr_code) throw new ErroApp(422, 'O Mercado Pago não devolveu o código Pix. Tente de novo.');
      ref = String(d.id); qr = td.qr_code;
    } else if (config.cobranca.provedor === 'demo') { ref = 'demo-' + atual.id.slice(0, 8); qr = pix.brCodeDemo(config.plataforma.nome, Number(atual.valor), 'FAT' + atual.id.slice(0, 6)); }
    else throw new ErroApp(422, 'O pagamento por Pix da mensalidade ainda não está ligado. Fale com o suporte para pagar.');
    await c.query('UPDATE faturas SET pix_ref = $2, pix_qr = $3, pix_expira = $4 WHERE id = $1', [atual.id, ref, qr, venceEm]);
    return { qr, expira: venceEm, demo: /^demo-/.test(ref) };
  });
}
async function conferirFatura(f) {
  if (!f.pix_ref || /^demo-/.test(f.pix_ref) || config.cobranca.provedor !== 'mercadopago' || !config.cobranca.mpToken) return false;
  const st = await pix.consultar(config.cobranca.mpToken, f.pix_ref);
  if (!st.pago || st.referencia !== 'fatura:' + f.id || Math.abs(st.valor - Number(f.valor)) > 0.009) return false;
  return !!(await darBaixa(f.id, 'pix'));
}

/* ---------- rotina (a cada hora, e ao iniciar) ---------- */
let rodando = false;
async function rotina() {
  if (rodando) return; rodando = true;
  try {
    const repo = require('./repo');
    const ids = await sistema(async c => (await c.query("SELECT id FROM restaurantes WHERE (cobranca->>'ativa')::boolean IS TRUE OR suspenso_cobranca")).rows.map(x => x.id));
    for (const id of ids) {
      try { await sistema(async c => { const rest = await repo.carregarRest(c, id); await gerarFatura(c, rest, false); await ajustarSituacao(c, rest); }); }
      catch (e) { console.error('Mensalidade (' + id + '):', e.message); }
    }
  } catch (e) { console.error('Rotina da mensalidade:', e.message); }
  rodando = false;
}
async function conferirPendentes() {
  if (config.cobranca.provedor !== 'mercadopago') return;
  try {
    const fs = await sistema(async c => (await c.query("SELECT * FROM faturas WHERE status = 'aberta' AND pix_ref IS NOT NULL AND pix_expira > now() - interval '1 hour' LIMIT 50")).rows);
    for (const f of fs) { try { await conferirFatura(f); } catch (e) {} }
  } catch (e) {}
}
function iniciar() {
  setTimeout(rotina, 5000).unref();
  setInterval(rotina, 60 * 60 * 1000).unref();
  setInterval(conferirPendentes, 60 * 1000).unref();
}

module.exports = { iniciar, rotina, gerarFatura, ajustarSituacao, darBaixa, pixDaFatura, conferirFatura, faturaObj, SELECT_F, linkFatura, mesTxt };
