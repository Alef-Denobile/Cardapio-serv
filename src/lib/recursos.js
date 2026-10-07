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
  nfce: 'Nota fiscal do consumidor (NFC-e)'
};

function recursosDe(rest) {
  const r = (rest && rest.recursos) || {}, o = {};
  Object.keys(RECURSOS).forEach(k => { o[k] = r[k] !== false; });
  return o;
}

module.exports = { RECURSOS, recursosDe };
