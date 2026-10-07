// Arquivos públicos servidos pelo próprio servidor:
//   /f/<id>           fotos enviadas pelo painel (guardadas no banco)
//   /nfce/demo/<id>   cupom da NFC-e em modo de demonstração (sem valor fiscal)
const express = require('express');
const { sistema } = require('../db');
const repo = require('../lib/repo');
const { rota, uuidValido } = require('../lib/util');
const fiscal = require('../lib/fiscal');

const r = express.Router();

r.get('/f/:id', rota(async (req, res) => {
  const id = String(req.params.id).replace(/\.(jpe?g|png|webp)$/i, '');
  if (!uuidValido(id)) return res.status(404).end();
  const f = await sistema(async c => (await c.query('SELECT tipo, dados FROM fotos WHERE id = $1', [id])).rows[0]);
  if (!f) return res.status(404).end();
  res.set({ 'Content-Type': f.tipo, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.end(f.dados);
}));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCnpj = d => String(d || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

r.get('/nfce/demo/:id', rota(async (req, res) => {
  if (!uuidValido(req.params.id)) return res.status(404).send('Nota não encontrada.');
  const out = await sistema(async c => {
    const n = (await c.query("SELECT * FROM notas_fiscais WHERE id = $1 AND ambiente = 'demo'", [req.params.id])).rows[0];
    if (!n) return null;
    const rest = await repo.carregarRest(c, n.restaurante_id);
    const p = (await repo.buscarPedido(c, n.restaurante_id, n.pedido_id)).obj;
    return { n, rest, p };
  });
  if (!out) return res.status(404).send('Nota não encontrada.');
  const { n, rest, p } = out, f = rest.fiscal || {};
  const itens = p.linhas.map((l, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(l.nome) + (l.opcoes.length ? '<br><small>' + esc(l.opcoes.join(', ')) + '</small>' : '') + '</td><td class="n">' + l.qtd + '</td><td class="n">' + brl(l.unit) + '</td><td class="n">' + brl(l.unit * l.qtd) + '</td></tr>').join('');
  const chave = String(n.chave || '').replace(/(\d{4})/g, '$1 ').trim();
  res.set('X-Robots-Tag', 'noindex');
  res.send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NFC-e ' + (n.numero || '') + ' (demonstração)</title><style>' +
    'body{margin:0;background:#eee;font:13px/1.4 "Courier New",monospace;color:#000}.p{max-width:80mm;margin:16px auto;background:#fff;padding:5mm}h1{font-size:14px;text-align:center;margin:0}' +
    '.c{text-align:center}.demo{border:2px solid #000;padding:4px;text-align:center;font-weight:700;margin:8px 0}table{width:100%;border-collapse:collapse}td,th{padding:2px 0;vertical-align:top;text-align:left}' +
    '.n{text-align:right;white-space:nowrap}hr{border:0;border-top:1px dashed #000}small{font-size:11px}.tot{font-weight:700;font-size:15px}@media print{body{background:#fff}.p{margin:0}}</style></head><body><div class="p">' +
    '<h1>' + esc(f.razao || rest.nome) + '</h1>' + (f.cnpj ? '<div class="c">CNPJ ' + esc(fmtCnpj(f.cnpj)) + (f.ie ? ' · IE ' + esc(f.ie) : '') + '</div>' : '') +
    '<div class="c">DANFE NFC-e – Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>' +
    '<div class="demo">' + (n.status === 'cancelada' ? 'NOTA CANCELADA<br>' : '') + 'EMITIDA EM MODO DE DEMONSTRAÇÃO<br>SEM VALOR FISCAL</div>' +
    '<table><tr><th>#</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Unit.</th><th class="n">Total</th></tr>' + itens + '</table><hr>' +
    '<table><tr><td>Qtd. total de itens</td><td class="n">' + p.linhas.reduce((a, l) => a + l.qtd, 0) + '</td></tr><tr class="tot"><td>Valor a pagar</td><td class="n">' + brl(n.valor) + '</td></tr>' +
    '<tr><td>Forma de pagamento</td><td class="n">' + esc(fiscal.FORMAS[n.pagamento] || n.pagamento) + '</td></tr></table><hr>' +
    '<div class="c">NFC-e nº ' + (n.numero || '') + ' Série ' + (n.serie || 1) + ' – ' + new Date(n.criado_em).toLocaleString('pt-BR', { timeZone: rest.fuso }) + '</div>' +
    '<div class="c"><small>Chave de acesso</small><br>' + esc(chave) + '</div>' +
    '<div class="c" style="margin-top:6px">' + (n.cpf ? 'CONSUMIDOR CPF ' + esc(n.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')) : 'CONSUMIDOR NÃO IDENTIFICADO') + '</div>' +
    '<div class="c" style="margin-top:6px">Pedido #' + p.numero + ' · ' + esc(rest.nome) + '</div></div></body></html>');
}));

module.exports = r;
