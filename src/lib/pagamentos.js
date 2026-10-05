// Pagamento pelo site. Cada empresa (Mercado Pago, PagBank, Asaas...) entra aqui como um "provedor".
// Hoje só existe o provedor "demo": uma tela de demonstração que NÃO pede cartão e NÃO cobra nada.
// O número do cartão nunca passa pelo nosso servidor: com uma empresa real, o cliente digita na página dela
// e ela avisa o servidor (webhook) quando o pagamento é aprovado.
const config = require('../config');

const PROVEDORES = {
  demo: {
    nome: 'Demonstração',
    // devolve para onde mandar o cliente pagar
    async iniciar(pedido, codigo) { return { url: '/pagar/' + pedido.id + '?c=' + encodeURIComponent(codigo), ref: 'demo-' + pedido.id.slice(0, 8) }; }
  }
  // mercadopago: { nome: 'Mercado Pago', async iniciar(pedido, codigo) { /* cria a preferência e devolve init_point */ } }
};

const provedor = () => PROVEDORES[config.pagamentoProvedor] || null;
const ativo = () => !!provedor() && config.clienteContas;

module.exports = { ativo, provedor, PROVEDORES };
