// Importar cardápio para cadastrar um restaurante novo em minutos.
// Três fontes, todas viram a mesma lista para revisar antes de gravar:
//   planilha (CSV ou Excel), foto do cardápio impresso (lida por IA) e link do iFood.
// Formato de cada item: { categoria, nome, descricao, preco, fotoUrl }
const ExcelJS = require('exceljs');
const config = require('../config');
const { ErroApp } = require('./util');

const limpa = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
function preco(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  let s = String(v == null ? '' : v).replace(/R\$|\s/gi, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else s = s.replace(/,/g, '');
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function normalizar(itens) {
  const vistos = new Set(), out = [];
  for (const i of itens) {
    const nome = limpa(i.nome, 80), cat = limpa(i.categoria, 60) || 'Cardápio', p = preco(i.preco);
    if (!nome || p == null || p < 0 || p > 100000) continue;
    const k = (cat + '|' + nome).toLowerCase(); if (vistos.has(k)) continue; vistos.add(k);
    const foto = /^https:\/\/\S+$/i.test(String(i.fotoUrl || '')) ? String(i.fotoUrl).slice(0, 500) : '';
    out.push({ categoria: cat, nome, descricao: limpa(i.descricao, 240), preco: p, fotoUrl: foto });
  }
  return out.slice(0, 500);
}

/* ---------- planilha ---------- */
const COLS = { categoria: /^(categoria|se[cç][aã]o|grupo|tipo)$/i, nome: /^(nome|produto|item|prato)$/i, descricao: /^(descri[cç][aã]o|detalhes|ingredientes)$/i, preco: /^(pre[cç]o|valor|r\$|pre[cç]o \(r\$\))$/i, fotoUrl: /^(foto|imagem|url da foto|link da foto)$/i };
function lerLinhas(linhas) {
  const avisos = [];
  let h = linhas.findIndex(l => l.some(c => COLS.nome.test(limpa(c, 40))));
  const mapa = {};
  if (h >= 0) linhas[h].forEach((c, i) => { const t = limpa(c, 40); Object.keys(COLS).forEach(k => { if (mapa[k] == null && COLS[k].test(t)) mapa[k] = i; }); });
  else { h = -1; Object.assign(mapa, { categoria: 0, nome: 1, descricao: 2, preco: 3, fotoUrl: 4 }); avisos.push('Não achei o cabeçalho (Categoria, Nome, Descrição, Preço). Li na ordem das colunas.'); }
  if (mapa.preco == null) throw new ErroApp(400, 'A planilha precisa de uma coluna "Preço".');
  const itens = []; let catAtual = '';
  linhas.slice(h + 1).forEach(l => {
    const g = k => mapa[k] == null ? '' : l[mapa[k]];
    const nome = limpa(g('nome'), 80), p = preco(g('preco'));
    if (mapa.categoria != null && limpa(g('categoria'), 60)) catAtual = limpa(g('categoria'), 60);
    // linha só com um texto e sem preço = título de categoria
    if (!nome && !p) { const t = l.map(c => limpa(c, 60)).filter(Boolean); if (t.length === 1) catAtual = t[0]; return; }
    if (nome && p == null) { avisos.push('Sem preço: ' + nome); return; }
    itens.push({ categoria: catAtual, nome, descricao: g('descricao'), preco: p, fotoUrl: g('fotoUrl') });
  });
  return { itens: normalizar(itens), avisos: avisos.slice(0, 20) };
}
function csv(texto) {
  const t = texto.replace(/^﻿/, ''), sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let l = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { l.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; l.push(c); linhas.push(l); l = []; c = ''; } else c += ch;
  }
  if (c || l.length) { l.push(c); linhas.push(l); }
  return linhas.filter(x => x.some(y => String(y).trim()));
}
async function planilha(buf, tipo) {
  if (/csv|text/.test(tipo) || !(buf[0] === 0x50 && buf[1] === 0x4B)) return lerLinhas(csv(buf.toString('utf8')));
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (e) { throw new ErroApp(400, 'Não consegui abrir a planilha. Salve como .xlsx ou .csv e tente de novo.'); }
  const ws = wb.worksheets[0]; if (!ws) throw new ErroApp(400, 'A planilha está vazia.');
  const linhas = [];
  ws.eachRow({ includeEmpty: false }, r => { const v = []; r.eachCell({ includeEmpty: true }, (cell, n) => { let x = cell.value; if (x && typeof x === 'object') x = x.result != null ? x.result : x.text || (x.richText ? x.richText.map(t => t.text).join('') : x.hyperlink || ''); v[n - 1] = x == null ? '' : x; }); linhas.push(v); });
  return lerLinhas(linhas);
}
async function modelo() {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Cardápio');
  ws.columns = [{ header: 'Categoria', width: 18 }, { header: 'Nome', width: 30 }, { header: 'Descrição', width: 50 }, { header: 'Preço', width: 10 }, { header: 'Foto', width: 40 }];
  [['Hambúrgueres', 'Cheeseburger', 'Blend 160 g, queijo prato, alface e tomate', 29.9, ''], ['Hambúrgueres', 'Bacon burger', 'Blend 160 g, bacon e cheddar', 34.9, ''], ['Bebidas', 'Refrigerante lata', '350 ml', 7, '']].forEach(l => ws.addRow(l));
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------- foto (IA) ---------- */
const PROMPT = 'Esta é a foto de um cardápio de restaurante. Liste TODOS os itens com preço. Responda só com JSON, sem texto antes ou depois, no formato ' +
  '{"itens":[{"categoria":"...","nome":"...","descricao":"...","preco":29.9}]}. Use a categoria do título da seção (ex.: Pizzas, Bebidas). ' +
  'Preço em número com ponto decimal. Se o item tiver tamanhos com preços diferentes, crie um item para cada tamanho (ex.: "Pizza Calabresa (grande)"). Não invente itens nem preços que não aparecem.';
async function foto(buf, tipo) {
  if (!config.ia.chave) throw new ErroApp(422, 'A leitura de foto não está ligada no servidor (falta ANTHROPIC_API_KEY). Use a planilha ou o iFood.');
  const media = /png/.test(tipo) ? 'image/png' : /webp/.test(tipo) ? 'image/webp' : 'image/jpeg';
  let r;
  try {
    r = await fetch(config.ia.url + '/v1/messages', { method: 'POST', headers: { 'x-api-key': config.ia.chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.ia.modelo, max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } }, { type: 'text', text: PROMPT }] }] }),
      signal: AbortSignal.timeout(120000) });
  } catch (e) { throw new ErroApp(422, 'A leitura da foto demorou demais ou falhou. Tente uma foto mais nítida ou a planilha.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Importar por foto:', r.status, JSON.stringify(d).slice(0, 300)); throw new ErroApp(422, r.status === 401 ? 'Chave da IA inválida (ANTHROPIC_API_KEY).' : 'A IA não conseguiu ler a foto agora. Tente de novo em instantes.'); }
  const txt = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const m = txt.match(/\{[\s\S]*\}/);
  let j; try { j = JSON.parse(m ? m[0] : txt); } catch (e) { throw new ErroApp(422, 'Não consegui entender a resposta da leitura. Tente uma foto mais reta e iluminada.'); }
  const itens = normalizar(Array.isArray(j.itens) ? j.itens : []);
  return { itens, avisos: itens.length ? ['Leitura automática: confira nomes e preços antes de importar.'] : ['Nenhum item com preço encontrado na foto.'] };
}

/* ---------- iFood ---------- */
// Não é uma API oficial: usa o mesmo endereço que o site do iFood usa para mostrar o cardápio. Pode mudar sem aviso.
const IFOOD = (process.env.IFOOD_API_URL || 'https://marketplace.ifood.com.br').replace(/\/+$/, '');
const IFOOD_IMG = 'https://static.ifood-static.com.br/image/upload/t_medium/pratos/';
function idDoLink(url) { const m = String(url || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i); return m ? m[1].toLowerCase() : null; }
function lerIfood(j) {
  const menu = (j && j.data && j.data.menu) || (j && j.menu) || (Array.isArray(j) ? j : null);
  if (!Array.isArray(menu)) throw new ErroApp(400, 'Esse conteúdo não parece um cardápio do iFood.');
  const itens = [];
  menu.forEach(cat => (cat.itens || cat.items || []).forEach(i => {
    const p = i.unitPrice != null && i.unitPrice > 0 ? i.unitPrice : i.unitMinPrice != null ? i.unitMinPrice : i.price;
    itens.push({ categoria: cat.name, nome: i.description || i.name, descricao: i.details || '', preco: p, fotoUrl: i.logoUrl ? (/^https?:/.test(i.logoUrl) ? i.logoUrl : IFOOD_IMG + i.logoUrl) : '' });
  }));
  return normalizar(itens);
}
async function ifood({ url, json }) {
  if (json) { let j; try { j = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { throw new ErroApp(400, 'O texto colado não é um JSON válido. Copie a página inteira.'); } const itens = lerIfood(j); return { itens, avisos: itens.length ? [] : ['Nenhum item encontrado.'] }; }
  const id = idDoLink(url);
  if (!id) throw new ErroApp(400, 'Cole o link da loja no iFood (termina com um código como 1a2b3c4d-...).');
  let r;
  try { r = await fetch(IFOOD + '/v1/merchants/' + id + '/catalog', { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; CardapioDigital/1.0)' }, signal: AbortSignal.timeout(15000) }); }
  catch (e) { throw Object.assign(new ErroApp(422, 'Não consegui acessar o iFood daqui. Use a opção "colar o conteúdo".'), { extra: { ifoodUrl: IFOOD + '/v1/merchants/' + id + '/catalog' } }); }
  if (!r.ok) throw Object.assign(new ErroApp(422, 'O iFood não respondeu (' + r.status + '). Use a opção "colar o conteúdo".'), { extra: { ifoodUrl: IFOOD + '/v1/merchants/' + id + '/catalog' } });
  const itens = lerIfood(await r.json().catch(() => ({})));
  return { itens, avisos: itens.length ? ['Fotos e preços vêm do iFood. Confira se os preços do seu cardápio são os mesmos (muitos restaurantes cobram mais caro no iFood).'] : ['Nenhum item encontrado.'] };
}

module.exports = { planilha, modelo, foto, ifood, normalizar, preco, csv, idDoLink };
