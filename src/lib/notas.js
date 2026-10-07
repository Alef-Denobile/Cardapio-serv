// Emissão e cancelamento de NFC-e de um pedido (usado pelo painel e pela emissão automática ao finalizar).
const { doRestaurante } = require('../db');
const repo = require('./repo');
const fiscal = require('./fiscal');
const config = require('../config');
const rt = require('../realtime');
const { recursosDe } = require('./recursos');
const { ErroApp, cpfValido, soDigitos } = require('./util');

const notaObj = n => n && ({ id: n.id, pedidoId: n.pedido_id, status: n.status, numero: n.numero, serie: n.serie, chave: n.chave, urlDanfe: n.url_danfe, urlXml: n.url_xml,
  mensagem: n.mensagem, valor: n.valor, pagamento: n.pagamento, ambiente: n.ambiente, criadoEm: n.criado_em });

// Última nota de cada pedido
async function notasDosPedidos(c, rid, ids) {
  if (!ids.length) return new Map();
  const rows = (await c.query('SELECT DISTINCT ON (pedido_id) * FROM notas_fiscais WHERE restaurante_id = $1 AND pedido_id = ANY($2::uuid[]) ORDER BY pedido_id, criado_em DESC', [rid, ids])).rows;
  return new Map(rows.map(n => [n.pedido_id, notaObj(n)]));
}

async function emitir(rid, pedidoId, opc = {}) {
  const prep = await doRestaurante(rid, async c => {
    const rest = await repo.carregarRest(c, rid);
    if (!recursosDe(rest).nfce) throw new ErroApp(403, 'A NFC-e não está incluída no plano deste restaurante. Fale com o suporte.');
    if (!fiscal.ativo()) throw new ErroApp(409, 'A emissão de notas está desligada no servidor.');
    const pend = fiscal.pendencias(rest);
    if (pend.length) throw new ErroApp(409, 'Para emitir NFC-e, complete em Configurações → Nota fiscal: ' + pend.join(', ') + '.');
    const pd = await repo.buscarPedido(c, rid, pedidoId);
    if (!pd) throw new ErroApp(404, 'Pedido não encontrado.');
    if (['cancelado', 'aguardando'].includes(pd.row.status)) throw new ErroApp(409, 'Não dá para emitir nota de pedido cancelado ou sem pagamento.');
    const ja = (await c.query("SELECT status FROM notas_fiscais WHERE pedido_id = $1 AND status IN ('autorizada', 'processando') LIMIT 1", [pd.row.id])).rows[0];
    if (ja) throw new ErroApp(409, ja.status === 'autorizada' ? 'Este pedido já tem NFC-e autorizada.' : 'A nota deste pedido ainda está sendo processada.');
    const forma = fiscal.FORMAS[opc.pagamento] ? opc.pagamento : fiscal.FORMA_PADRAO[pd.row.pag_metodo];
    if (!forma) throw new ErroApp(400, 'Escolha como o cliente pagou para emitir a nota.');
    const cpf = soDigitos(opc.cpf) || pd.row.cliente_cpf || null;
    if (cpf && !cpfValido(cpf)) throw new ErroApp(400, 'CPF na nota inválido. Confira os números.');
    const tent = (await c.query('SELECT count(*)::int AS n FROM notas_fiscais WHERE pedido_id = $1', [pd.row.id])).rows[0].n;
    const ref = 'p' + pd.row.numero + '-' + pd.row.id.slice(0, 8) + (tent ? '-' + (tent + 1) : '');
    const demo = config.fiscalProvedor === 'demo';
    const numeroDemo = demo ? (await c.query("SELECT count(*)::int + 1 AS n FROM notas_fiscais WHERE restaurante_id = $1 AND ambiente = 'demo'", [rid])).rows[0].n : null;
    const nota = (await c.query('INSERT INTO notas_fiscais (restaurante_id, pedido_id, ref, ambiente, pagamento, cpf) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [rid, pd.row.id, ref, demo ? 'demo' : (rest.fiscal.ambiente === 'producao' ? 'producao' : 'homologacao'), forma, cpf])).rows[0];
    const token = (await c.query('SELECT fiscal_token FROM restaurantes WHERE id = $1', [rid])).rows[0].fiscal_token;
    const pids = pd.obj.linhas.map(l => l.produto).filter(Boolean);
    const produtosFiscais = new Map((pids.length ? (await c.query('SELECT id, fiscal FROM produtos WHERE restaurante_id = $1 AND id = ANY($2::uuid[])', [rid, pids])).rows : []).map(x => [String(x.id), x.fiscal || {}]));
    return { rest, token, pedido: pd.obj, produtosFiscais, nota, forma, cpf, numeroDemo };
  });
  let resp;
  try {
    resp = await fiscal.emitir({ rest: prep.rest, token: prep.token, pedido: prep.pedido, produtosFiscais: prep.produtosFiscais, ref: prep.nota.ref, forma: prep.forma, cpf: prep.cpf, notaId: prep.nota.id, numeroDemo: prep.numeroDemo });
  } catch (e) {
    const n = await doRestaurante(rid, async c => (await c.query("UPDATE notas_fiscais SET status = 'erro', mensagem = $2 WHERE id = $1 RETURNING *", [prep.nota.id, e.message])).rows[0]);
    rt.paraEquipe(rid, 'nota:atualizada', notaObj(n));
    throw e;
  }
  const n = await doRestaurante(rid, async c => (await c.query('UPDATE notas_fiscais SET status = $2, numero = $3, serie = $4, chave = $5, url_danfe = $6, url_xml = $7, mensagem = $8, valor = $9 WHERE id = $1 RETURNING *',
    [prep.nota.id, resp.status, resp.numero, resp.serie, resp.chave, resp.urlDanfe, resp.urlXml, String(resp.mensagem || '').slice(0, 500), resp.valor || 0])).rows[0]);
  const obj = notaObj(n);
  rt.paraEquipe(rid, 'nota:atualizada', obj);
  return obj;
}

// Nota que ficou "processando" no emissor: pergunta de novo
async function atualizar(rid, notaId) {
  const prep = await doRestaurante(rid, async c => {
    const n = (await c.query('SELECT * FROM notas_fiscais WHERE id = $1 AND restaurante_id = $2', [notaId, rid])).rows[0];
    if (!n) throw new ErroApp(404, 'Nota não encontrada.');
    return { n, rest: await repo.carregarRest(c, rid), token: (await c.query('SELECT fiscal_token FROM restaurantes WHERE id = $1', [rid])).rows[0].fiscal_token };
  });
  if (prep.n.status !== 'processando') return notaObj(prep.n);
  const resp = await fiscal.consultar({ rest: prep.rest, token: prep.token, ref: prep.n.ref });
  if (!resp) return notaObj(prep.n);
  const n = await doRestaurante(rid, async c => (await c.query('UPDATE notas_fiscais SET status = $2, numero = coalesce($3, numero), serie = coalesce($4, serie), chave = coalesce($5, chave), url_danfe = coalesce($6, url_danfe), url_xml = coalesce($7, url_xml), mensagem = $8 WHERE id = $1 RETURNING *',
    [notaId, resp.status, resp.numero, resp.serie, resp.chave, resp.urlDanfe, resp.urlXml, String(resp.mensagem || '').slice(0, 500)])).rows[0]);
  const obj = notaObj(n); rt.paraEquipe(rid, 'nota:atualizada', obj); return obj;
}

async function cancelar(rid, notaId, justificativa) {
  justificativa = String(justificativa || '').trim().slice(0, 255);
  if (justificativa.length < 15) throw new ErroApp(400, 'Escreva o motivo do cancelamento (pelo menos 15 letras).');
  const prep = await doRestaurante(rid, async c => {
    const n = (await c.query('SELECT * FROM notas_fiscais WHERE id = $1 AND restaurante_id = $2', [notaId, rid])).rows[0];
    if (!n) throw new ErroApp(404, 'Nota não encontrada.');
    if (n.status !== 'autorizada') throw new ErroApp(409, 'Só dá para cancelar nota autorizada.');
    return { n, rest: await repo.carregarRest(c, rid), token: (await c.query('SELECT fiscal_token FROM restaurantes WHERE id = $1', [rid])).rows[0].fiscal_token };
  });
  const resp = await fiscal.cancelar({ rest: prep.rest, token: prep.token, ref: prep.n.ref, justificativa });
  if (resp.status !== 'cancelada') throw new ErroApp(409, 'O emissor não cancelou a nota' + (resp.mensagem ? ': ' + resp.mensagem : '.') + ' Em geral a NFC-e só pode ser cancelada até 30 minutos depois de emitida.');
  const n = await doRestaurante(rid, async c => (await c.query("UPDATE notas_fiscais SET status = 'cancelada', mensagem = $2 WHERE id = $1 RETURNING *", [notaId, ('Cancelada: ' + justificativa).slice(0, 500)])).rows[0]);
  const obj = notaObj(n); rt.paraEquipe(rid, 'nota:atualizada', obj); return obj;
}

// Emissão automática quando o pedido é finalizado (se o dono ligou e a forma de pagamento é conhecida)
async function automatica(rid, pedido) {
  try {
    const rest = await doRestaurante(rid, c => repo.carregarRest(c, rid));
    if (!recursosDe(rest).nfce || !rest.fiscal.auto || !fiscal.ativo() || fiscal.pendencias(rest).length) return;
    if (!fiscal.FORMA_PADRAO[pedido.pagamento.metodo]) return; // "pagar no local": o caixa emite escolhendo a forma
    await emitir(rid, pedido.id, {});
  } catch (e) { if (e.status !== 409) console.error('NFC-e automática do pedido #' + pedido.numero + ':', e.message); }
}

module.exports = { notaObj, notasDosPedidos, emitir, atualizar, cancelar, automatica };
