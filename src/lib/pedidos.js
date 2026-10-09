// Monta e valida um pedido a partir do que o cliente enviou.
// Regra de ouro: preços e taxas vêm SEMPRE do banco, nunca do navegador.
const { ErroApp, texto, numero, centavos, iguais, estaAberto, uuidValido, cpfValido, soDigitos, horariosAgendamento, distanciaKm, coordValida } = require('./util');
const estoque = require('./estoque');
const pagamentos = require('./pagamentos');
const pix = require('./pix');
const combos = require('./combos');
const horarios = require('./horarios');
const { recursosDe } = require('./recursos');

const METODOS = { mesa: ['pix', 'local'], retirada: ['pix', 'local'], delivery: ['online', 'pix', 'cartao', 'dinheiro'] };
// Formas em que o pagamento é feito antes, pelo site, e confirmado pela empresa de pagamento
const PAGO_NO_SITE = ['online'];
// Formas de pagamento liberadas para cada tipo, considerando as funções ligadas pelos devs
function metodosPermitidos(rest, tipo) { const rc = recursosDe(rest); return (METODOS[tipo] || []).filter(m => m === 'local' || (m === 'online' ? rc.online && pagamentos.ativo() : rc[m])); }
// Tipos de pedido que o restaurante aceita agora
function tiposPermitidos(rest) {
  const rc = recursosDe(rest), t = [];
  if (rc.mesa) t.push('mesa');
  if (rc.retirada) t.push('retirada');
  if (rc.delivery && rest.delivery && rest.delivery.ativo && metodosPermitidos(rest, 'delivery').length) t.push('delivery');
  return t;
}

// c = conexão já no contexto do restaurante (doRestaurante)
async function montarPedido(c, rest, corpo) {
  if (!rest.ativo) throw new ErroApp(403, 'Este restaurante não está recebendo pedidos.');

  const tipo = corpo.tipo;
  if (!METODOS[tipo]) throw new ErroApp(400, 'Escolha como quer receber o pedido.');

  // Totem de autoatendimento: só com o código secreto do totem do restaurante
  const totem = corpo.totem ? texto(corpo.totem, 40) : '';
  if (totem) {
    if (!recursosDe(rest).totem || !rest.totemToken || !iguais(rest.totemToken, totem)) throw new ErroApp(403, 'Este totem não está liberado. Peça ajuda no caixa.');
    if (tipo !== 'retirada') throw new ErroApp(400, 'O totem faz pedidos para retirar no balcão.');
  } else if (!tiposPermitidos(rest).includes(tipo)) throw new ErroApp(409, { mesa: 'Este restaurante não recebe pedidos pela mesa.', retirada: 'Este restaurante não está fazendo retirada no balcão.', delivery: 'Este restaurante não está fazendo entregas no momento.' }[tipo]);

  // Pedido agendado: o horário precisa ser um dos oferecidos agora
  let agendadoPara = null;
  if (corpo.agendarPara && tipo !== 'mesa' && !totem) {
    if (!(rest.agendamento && rest.agendamento.ativo)) throw new ErroApp(409, 'Este restaurante não está aceitando pedidos agendados.');
    const alvo = new Date(String(corpo.agendarPara));
    if (isNaN(alvo)) throw new ErroApp(400, 'Escolha o dia e o horário do pedido agendado.');
    const livres = horariosAgendamento(rest).flatMap(d => d.horarios.map(h => h.em));
    if (!livres.includes(alvo.toISOString())) throw new ErroApp(409, 'Esse horário não está mais disponível. Escolha outro.');
    agendadoPara = alvo;
  }
  if (!agendadoPara && !rest.aceitarForaDoHorario && !estaAberto(rest)) throw new ErroApp(409, `O restaurante está fechado agora. Abrimos às ${rest.abre}.` + (rest.agendamento && rest.agendamento.ativo && tipo !== 'mesa' && !totem ? ' Você pode agendar o pedido para mais tarde.' : ''));

  let mesa = null;
  if (tipo === 'mesa') {
    const n = Math.trunc(numero(corpo.mesa && corpo.mesa.numero, 0));
    const m = n > 0 ? (await c.query('SELECT token FROM mesas WHERE restaurante_id = $1 AND numero = $2', [rest.id, n])).rows[0] : null;
    if (!m || !iguais(m.token, texto(corpo.mesa && corpo.mesa.token, 40))) throw new ErroApp(403, 'QR Code da mesa inválido ou vencido. Peça ajuda ao garçom.');
    mesa = n;
  }

  const itens = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 60) : [];
  if (!itens.length) throw new ErroApp(400, 'Seu pedido está vazio.');
  const ids = [...new Set(itens.map(i => String(i.produto || '')))].filter(uuidValido);
  let produtos = ids.length ? (await c.query('SELECT id, nome, preco, opcoes, esgotado, categoria, ordem, disponibilidade FROM produtos WHERE restaurante_id = $1 AND id = ANY($2::uuid[])', [rest.id, ids])).rows : [];
  // combo e meio a meio: as escolhas são os produtos de outra categoria (mesma lista que o site mostra)
  if (produtos.some(combos.composto)) {
    if (!recursosDe(rest).combos) throw new ErroApp(409, 'Este combo não está mais disponível. Atualize a página.');
    const todos = (await c.query('SELECT id, nome, preco, opcoes, esgotado, categoria, ordem, disponibilidade FROM produtos WHERE restaurante_id = $1', [rest.id])).rows;
    const semEstoque = new Set([...(await estoque.resumoProdutos(c, rest.id))].filter(([, v]) => v.semEstoque.length).map(([k]) => k));
    // sabor ou item de combo fora do horário também não pode ser escolhido
    if (horarios.ligado(rest)) todos.forEach(p => { if (p.disponibilidade && !horarios.disponivel(p.disponibilidade, agendadoPara || new Date(), rest.fuso)) semEstoque.add(p.id); });
    const exp = new Map(combos.expandir(todos, semEstoque).map(p => [p.id, p]));
    produtos = produtos.map(p => exp.get(p.id) || p);
  }
  const porId = new Map(produtos.map(p => [p.id, p]));

  const linhas = itens.map(i => {
    const p = porId.get(String(i.produto));
    if (!p) throw new ErroApp(400, 'Um dos produtos não existe mais no cardápio. Atualize a página.');
    if (p.esgotado) throw new ErroApp(409, `${p.nome} acabou de esgotar. Remova do pedido para continuar.`);
    if (horarios.ligado(rest) && p.disponibilidade && !horarios.disponivel(p.disponibilidade, agendadoPara || new Date(), rest.fuso)) throw new ErroApp(409, `${p.nome} só é servido ${horarios.texto(p.disponibilidade)}. Remova do pedido para continuar.`);
    const qtd = Math.trunc(numero(i.qtd, 1));
    if (qtd < 1 || qtd > 50) throw new ErroApp(400, 'Quantidade inválida.');
    const esc = i.escolhas && typeof i.escolhas === 'object' ? i.escolhas : {};
    let unit = p.preco; const nomes = [], componentes = [];
    (p.opcoes || []).forEach((o, oi) => {
      let sel = Array.isArray(esc[oi]) ? [...new Set(esc[oi].map(x => Math.trunc(numero(x, -1))))] : [];
      sel = sel.filter(x => x >= 0 && x < o.escolhas.length);
      if (o.tipo === 'um') { if (sel.length !== 1) sel = [0]; }
      if (o.tipo === 'combo' || o.tipo === 'sabores') {
        const rg = combos.regra(o);
        if (sel.length < rg.min || sel.length > rg.max) throw new ErroApp(400, o.tipo === 'combo' ? `Escolha ${rg.min} em "${o.nome}" (${p.nome}).` : `Escolha de 1 a ${rg.max} sabores em ${p.nome}.`);
        const es = sel.map(x => o.escolhas[x]);
        const fora = es.find(e => e.esgotado); if (fora) throw new ErroApp(409, `${fora.nome} acabou de esgotar. Escolha outro em ${p.nome}.`);
        if (o.tipo === 'sabores') {
          unit += o.regra === 'media' ? Math.round(es.reduce((a, e) => a + e.preco, 0) / es.length * 100) / 100 : Math.max(...es.map(e => e.preco));
          es.forEach(e => { nomes.push(es.length > 1 ? '1/' + es.length + ' ' + e.nome : e.nome); componentes.push({ produto: e.produto, nome: e.nome, frac: 1 / es.length }); });
        } else es.forEach(e => { nomes.push(e.nome); componentes.push({ produto: e.produto, nome: e.nome, frac: 1 }); });
        return;
      }
      sel.sort((a, b) => a - b).forEach(x => { unit += o.escolhas[x].preco || 0; nomes.push(o.escolhas[x].nome); });
    });
    return { produto: p.id, nome: p.nome, qtd, unit: centavos(unit), opcoes: nomes, componentes };
  });

  // Estoque pela ficha técnica: prato sem insumo suficiente não pode ser pedido. Guarda o custo para o lucro por prato.
  // No combo e no meio a meio, entram também as fichas dos itens escolhidos (cada sabor com a sua fração).
  const linhasEstoque = linhas.flatMap(l => [{ produto: l.produto, nome: l.nome, qtd: l.qtd }].concat((l.componentes || []).map(cp => ({ produto: cp.produto, nome: cp.nome, qtd: l.qtd * cp.frac, de: l }))));
  const fichas = await estoque.fichasDe(c, rest.id, [...new Set(linhasEstoque.map(l => l.produto))]);
  const usa = new Map();
  linhasEstoque.forEach(l => (fichas.get(l.produto) || []).forEach(x => usa.set(x.insumo_id, { x, qtd: (usa.has(x.insumo_id) ? usa.get(x.insumo_id).qtd : 0) + x.qtd * l.qtd, nome: (l.de || l).nome })));
  const faltou = [...usa.values()].find(u => u.x.estoque < u.qtd - 1e-9);
  if (faltou) throw new ErroApp(409, `${faltou.nome} acabou de esgotar. Remova do pedido para continuar.`);
  linhas.forEach(l => {
    const partes = [{ produto: l.produto, frac: 1 }].concat(l.componentes || []);
    const temFicha = partes.some(pt => fichas.has(pt.produto)); if (!temFicha) return;
    l.custo = Math.round(partes.reduce((a, pt) => a + (fichas.get(pt.produto) || []).reduce((b, x) => b + x.qtd * x.custo, 0) * pt.frac, 0) * 10000) / 10000;
  });

  const subtotal = centavos(linhas.reduce((a, l) => a + l.unit * l.qtd, 0));
  const servico = tipo === 'mesa' ? centavos(subtotal * rest.taxaServico / 100) : 0;

  const cliente = { nome: texto(corpo.cliente && corpo.cliente.nome, 60) || 'Cliente', tel: texto(corpo.cliente && corpo.cliente.tel, 20) };
  let entrega = null, taxaEntrega = 0;
  // Pedido feito no próprio restaurante (totem ou menu do salão, para retirar no balcão): basta o nome
  const salao = !totem && tipo === 'retirada' && corpo.local === true;
  if (totem || salao) { if (cliente.nome === 'Cliente' || cliente.nome.length < 2) throw new ErroApp(400, 'Diga seu nome para chamarmos quando o pedido ficar pronto.'); }
  else if (tipo !== 'mesa' && cliente.tel.replace(/\D/g, '').length < 10) throw new ErroApp(400, 'Informe seu WhatsApp com DDD para o restaurante falar com você.');
  if (tipo === 'delivery') {
    const e = corpo.entrega || {};
    let taxaBase;
    if (rest.delivery.modo === 'distancia') {
      // Taxa por distância: em linha reta entre o restaurante e o ponto marcado no mapa
      const loc = rest.delivery.local || {}, faixas = rest.delivery.faixas || [];
      if (!coordValida(loc.lat, loc.lng) || !faixas.length) throw new ErroApp(409, 'A entrega por distância ainda não foi configurada pelo restaurante.');
      const lat = numero(e.lat, NaN), lng = numero(e.lng, NaN);
      if (!coordValida(lat, lng)) throw new ErroApp(400, 'Marque no mapa o local da entrega.');
      const km = Math.round(distanciaKm(loc, { lat, lng }) * 100) / 100, faixa = faixas.find(f => km <= f.ate);
      if (!faixa) throw new ErroApp(400, `Seu endereço fica a ${String(km.toFixed(1)).replace('.', ',')} km do restaurante, fora da área de entrega (até ${String(faixas[faixas.length - 1].ate).replace('.', ',')} km).`);
      const bairro = texto(e.bairro, 60);
      if (bairro.length < 2) throw new ErroApp(400, 'Informe o bairro da entrega.');
      entrega = { endereco: texto(e.endereco, 140), complemento: texto(e.complemento, 60), referencia: texto(e.referencia, 100), bairro, lat, lng, km };
      taxaBase = faixa.taxa;
    } else {
      const bairro = rest.delivery.bairros.find(b => b.nome === texto(e.bairro, 60));
      if (!bairro) throw new ErroApp(400, 'Escolha um bairro atendido pela entrega.');
      entrega = { endereco: texto(e.endereco, 140), complemento: texto(e.complemento, 60), referencia: texto(e.referencia, 100), bairro: bairro.nome };
      const lat = numero(e.lat, NaN), lng = numero(e.lng, NaN);
      if (coordValida(lat, lng)) Object.assign(entrega, { lat, lng }); // ponto no mapa, se o cliente marcou: ajuda o entregador
      taxaBase = bairro.taxa;
    }
    if (entrega.endereco.length < 4) throw new ErroApp(400, 'Informe a rua e o número para a entrega.');
    if (subtotal < rest.delivery.pedidoMinimo) throw new ErroApp(400, `O pedido mínimo para entrega é R$ ${rest.delivery.pedidoMinimo.toFixed(2).replace('.', ',')}.`);
    const gratis = rest.delivery.gratisAcimaDe > 0 && subtotal >= rest.delivery.gratisAcimaDe;
    taxaEntrega = gratis ? 0 : taxaBase;
  }
  const total = centavos(subtotal + servico + taxaEntrega);

  const metodo = texto(corpo.pagamento && corpo.pagamento.metodo, 10);
  if (!metodosPermitidos(rest, tipo).includes(metodo)) throw new ErroApp(400, 'Escolha uma forma de pagamento disponível.');
  const troco = metodo === 'dinheiro' ? centavos(Math.max(0, numero(corpo.pagamento.troco, 0))) : 0;
  if (troco && troco < total) throw new ErroApp(400, 'O troco precisa ser para um valor maior que o total do pedido.');

  // Pix automático: o pedido só vai para a cozinha depois que o Pix é confirmado (na mesa, a conta continua no fim)
  const pixAuto = metodo === 'pix' && tipo !== 'mesa' && pix.ativo(rest);
  // Entrega paga na porta (ou Pix manual): pede o CPF para desencorajar pedido falso (trote)
  if (tipo === 'delivery' && !PAGO_NO_SITE.includes(metodo) && !pixAuto) {
    const cpf = soDigitos(corpo.cliente && corpo.cliente.cpf);
    if (!cpfValido(cpf)) throw new ErroApp(400, cpf ? 'CPF inválido. Confira os números.' : 'Para pagar na entrega, informe seu CPF.');
    cliente.cpf = cpf;
  }

  return { linhasEstoque: linhasEstoque.map(l => ({ produto: l.produto, nome: (l.de || l).nome, qtd: l.qtd })), status: PAGO_NO_SITE.includes(metodo) || pixAuto ? 'aguardando' : 'novo', tipo, mesa, cliente, entrega, linhas, obs: texto(corpo.obs, 300), subtotal, servico, taxaEntrega, total,
    pagamento: { metodo, troco, status: PAGO_NO_SITE.includes(metodo) || pixAuto ? 'pendente' : null, pixAuto },
    agendadoPara: salao ? null : agendadoPara, origem: totem ? 'totem' : salao ? 'salao' : tipo === 'mesa' ? 'mesa' : 'site', consumo: totem ? (corpo.consumo === 'viagem' ? 'viagem' : 'local') : null };
}

module.exports = { montarPedido, METODOS, PAGO_NO_SITE, metodosPermitidos, tiposPermitidos };
