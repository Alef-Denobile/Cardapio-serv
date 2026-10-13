/* Página de divulgação: troca da demonstração e mensagem pronta do WhatsApp */
(function(){
'use strict';
const $ = s => document.querySelector(s);

// mensagem que já vem escrita quando a pessoa toca em "Fale conosco"
const MSG = 'Olá! Vi a página do Cardápio Digital e quero saber mais.';
document.querySelectorAll('[data-zap]').forEach(a => { a.href = 'https://wa.me/5515988053447?text=' + encodeURIComponent(MSG); });

const DEMOS = {
  lanchonete: { slug: 'sabor-da-casa', nome: 'Sabor da Casa', desc: 'Hamburgueria com combos, porções e totem no balcão. Ótima para quem tem fila na hora do almoço e muito pedido de delivery.',
    itens: ['Combos com escolha do lanche e da bebida', 'Totem de autoatendimento no balcão', 'Delivery com taxa por bairro', 'Pedido pela mesa com QR Code'] },
  sorveteria: { slug: 'gelato-e-cia', nome: 'Gelato & Cia', desc: 'Sorveteria com sorvetes de 1 a 3 bolas, açaí com adicionais e milkshakes. O cliente escolhe sabores e coberturas sem confusão.',
    itens: ['Escolha de sabores, tamanho e cobertura', 'Açaí com adicionais pagos', 'Totem no balcão para evitar fila', 'Retirada e delivery'] },
  restaurante: { slug: 'cantina-bella', nome: 'Cantina Bella', desc: 'Restaurante italiano com pedido pela mesa. O cliente pede, chama o garçom e pede a conta pelo celular.',
    itens: ['QR Code em cada mesa', 'Chamar o garçom e pedir a conta', 'Taxa de serviço de 10% automática', 'Delivery e pedido agendado'] }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const frame = $('#demo-frame');
let carregou = false;

function mostrar(tipo, foco){
  const d = DEMOS[tipo]; if (!d) return;
  document.querySelectorAll('[data-demo]').forEach(b => { const on = b.dataset.demo === tipo; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && foco) b.focus(); });
  $('#demo-painel').setAttribute('aria-labelledby', 'ab-' + tipo);
  $('#demo-nome').textContent = d.nome; $('#demo-desc').textContent = d.desc;
  $('#demo-lista').innerHTML = d.itens.map(i => '<li>' + esc(i) + '</li>').join('');
  $('#demo-site').href = '/r/' + d.slug; $('#demo-salao').href = '/r/' + d.slug + '/salao';
  frame.dataset.src = '/r/' + d.slug;
  frame.title = 'Demonstração ao vivo: ' + d.nome;
  if (carregou) frame.src = frame.dataset.src;
}
document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => mostrar(b.dataset.demo)));
// setas do teclado nas abas
$('.demo-abas').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tipos = Object.keys(DEMOS), atual = tipos.indexOf(($('[data-demo][aria-selected="true"]') || {}).dataset.demo);
  mostrar(tipos[(atual + (e.key === 'ArrowRight' ? 1 : tipos.length - 1)) % tipos.length], true);
});
mostrar('lanchonete');

// só carrega a demonstração de baixo quando a pessoa chega perto dela (a página abre mais rápido)
function carregar(){ if (carregou) return; carregou = true; frame.src = frame.dataset.src; }
if ('IntersectionObserver' in window) {
  const ob = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { carregar(); ob.disconnect(); } }, { rootMargin: '300px' });
  ob.observe(frame);
} else carregar();

const ano = $('#ano'); if (ano) ano.textContent = new Date().getFullYear();
})();
