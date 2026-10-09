// Funções que a equipe de devs pode ligar ou desligar em cada restaurante.
// Se uma função está desligada aqui, o dono não consegue religar pelo painel.
const RECURSOS = {
  mesa: 'Pedidos na mesa (QR Code)',
  chamados: 'Chamar garçom e pedir a conta',
  retirada: 'Retirada no balcão',
  delivery: 'Delivery (entrega)',
  pix: 'Pagamento por Pix',
  cartao: 'Cartão na entrega',
  dinheiro: 'Dinheiro na entrega',
  online: 'Pagamento pelo site (entrega)',
  whatsapp: 'Avisos automáticos no WhatsApp',
  totem: 'Modo totem (autoatendimento no balcão)',
  nfce: 'Nota fiscal do consumidor (NFC-e)',
  pixauto: 'Pix com confirmação automática',
  combos: 'Combos e pizza meio a meio',
  horarios: 'Produtos por horário',
  carrinho: 'Lembrete de carrinho no WhatsApp',
  dominio: 'Domínio próprio'
};
// Extras: começam desligados e só ligam quando a equipe de devs ativa
const DESLIGADOS = ['combos', 'horarios', 'carrinho', 'dominio'];

function recursosDe(rest) {
  const r = (rest && rest.recursos) || {}, o = {};
  Object.keys(RECURSOS).forEach(k => { o[k] = DESLIGADOS.includes(k) ? r[k] === true : r[k] !== false; });
  return o;
}

// Lê as colunas rec_* de uma linha da tabela restaurantes
function recursosDaLinha(row) {
  const o = { vitrine: row.rec_vitrine };
  Object.keys(RECURSOS).forEach(k => { o[k] = row['rec_' + k]; });
  return o;
}

module.exports = { RECURSOS, DESLIGADOS, recursosDe, recursosDaLinha };
