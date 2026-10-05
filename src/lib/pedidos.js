// Monta e valida um pedido a partir do que o cliente enviou.
// Regra de ouro: preços e taxas vêm SEMPRE do banco, nunca do navegador.
const { ErroApp, texto, numero, centavos, iguais, estaAberto, uuidValido, cpfValido, soDigitos } = require('./util');
const pagamentos = require('./pagamentos');
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
  if (!rest.aceitarForaDoHorario && !estaAberto(rest)) throw new ErroApp(409, `O restaurante está fechado agora. Abrimos às ${rest.abre}.`);

  const tipo = corpo.tipo;
  if (!METODOS[tipo]) throw new ErroApp(400, 'Escolha como quer receber o pedido.');
  if (!tiposPermitidos(rest).includes(tipo)) throw new ErroApp(409, { mesa: 'Este restaurante não recebe pedidos pela mesa.', retirada: 'Este restaurante não está fazendo retirada no balcão.', delivery: 'Este restaurante não está fazendo entregas no momento.' }[tipo]);

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
  const produtos = ids.length ? (await c.query('SELECT id, nome, preco, opcoes, esgotado FROM produtos WHERE restaurante_id = $1 AND id = ANY($2::uuid[])', [rest.id, ids])).rows : [];
  const porId = new Map(produtos.map(p => [p.id, p]));

  const linhas = itens.map(i => {
    const p = porId.get(String(i.produto));
    if (!p) throw new ErroApp(400, 'Um dos produtos não existe mais no cardápio. Atualize a página.');
    if (p.esgotado) throw new ErroApp(409, `${p.nome} acabou de esgotar. Remova do pedido para continuar.`);
    const qtd = Math.trunc(numero(i.qtd, 1));
    if (qtd < 1 || qtd > 50) throw new ErroApp(400, 'Quantidade inválida.');
    const esc = i.escolhas && typeof i.escolhas === 'object' ? i.escolhas : {};
    let unit = p.preco; const nomes = [];
    (p.opcoes || []).forEach((o, oi) => {
      let sel = Array.isArray(esc[oi]) ? [...new Set(esc[oi].map(x => Math.trunc(numero(x, -1))))] : [];
      sel = sel.filter(x => x >= 0 && x < o.escolhas.length);
      if (o.tipo === 'um') { if (sel.length !== 1) sel = [0]; }
      sel.sort((a, b) => a - b).forEach(x => { unit += o.escolhas[x].preco || 0; nomes.push(o.escolhas[x].nome); });
    });
    return { produto: p.id, nome: p.nome, qtd, unit: centavos(unit), opcoes: nomes };
  });

  const subtotal = centavos(linhas.reduce((a, l) => a + l.unit * l.qtd, 0));
  const servico = tipo === 'mesa' ? centavos(subtotal * rest.taxaServico / 100) : 0;

  const cliente = { nome: texto(corpo.cliente && corpo.cliente.nome, 60) || 'Cliente', tel: texto(corpo.cliente && corpo.cliente.tel, 20) };
  let entrega = null, taxaEntrega = 0;
  if (tipo !== 'mesa' && cliente.tel.replace(/\D/g, '').length < 10) throw new ErroApp(400, 'Informe seu WhatsApp com DDD para o restaurante falar com você.');
  if (tipo === 'delivery') {
    const e = corpo.entrega || {};
    const bairro = rest.delivery.bairros.find(b => b.nome === texto(e.bairro, 60));
    if (!bairro) throw new ErroApp(400, 'Escolha um bairro atendido pela entrega.');
    entrega = { endereco: texto(e.endereco, 140), complemento: texto(e.complemento, 60), referencia: texto(e.referencia, 100), bairro: bairro.nome };
    if (entrega.endereco.length < 4) throw new ErroApp(400, 'Informe a rua e o número para a entrega.');
    if (subtotal < rest.delivery.pedidoMinimo) throw new ErroApp(400, `O pedido mínimo para entrega é R$ ${rest.delivery.pedidoMinimo.toFixed(2).replace('.', ',')}.`);
    const gratis = rest.delivery.gratisAcimaDe > 0 && subtotal >= rest.delivery.gratisAcimaDe;
    taxaEntrega = gratis ? 0 : bairro.taxa;
  }
  const total = centavos(subtotal + servico + taxaEntrega);

  const metodo = texto(corpo.pagamento && corpo.pagamento.metodo, 10);
  if (!metodosPermitidos(rest, tipo).includes(metodo)) throw new ErroApp(400, 'Escolha uma forma de pagamento disponível.');
  const troco = metodo === 'dinheiro' ? centavos(Math.max(0, numero(corpo.pagamento.troco, 0))) : 0;
  if (troco && troco < total) throw new ErroApp(400, 'O troco precisa ser para um valor maior que o total do pedido.');

  // Entrega paga na porta (ou Pix manual): pede o CPF para desencorajar pedido falso (trote)
  if (tipo === 'delivery' && !PAGO_NO_SITE.includes(metodo)) {
    const cpf = soDigitos(corpo.cliente && corpo.cliente.cpf);
    if (!cpfValido(cpf)) throw new ErroApp(400, cpf ? 'CPF inválido. Confira os números.' : 'Para pagar na entrega, informe seu CPF.');
    cliente.cpf = cpf;
  }

  return { status: PAGO_NO_SITE.includes(metodo) ? 'aguardando' : 'novo', tipo, mesa, cliente, entrega, linhas, obs: texto(corpo.obs, 300), subtotal, servico, taxaEntrega, total, pagamento: { metodo, troco } };
}

module.exports = { montarPedido, METODOS, PAGO_NO_SITE, metodosPermitidos, tiposPermitidos };
