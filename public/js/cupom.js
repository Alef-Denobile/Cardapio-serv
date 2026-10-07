/* Cupom do pedido para impressora térmica (80 mm ou 58 mm).
   Funciona com qualquer impressora térmica instalada no computador (Elgin, Bematech, Epson, Daruma...).
   Imprime por uma "folha" invisível na própria página, sem programa extra. */
(function (w) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pad = n => String(n).padStart(2, '0');
  const PAG = { online: 'Pago pelo site', pix: 'Pix', cartao: 'Cartão na entrega', dinheiro: 'Dinheiro', local: 'Pagar no local' };

  function html(p, rest, largura) {
    const mm = largura === 58 ? 58 : 80, fonte = mm === 58 ? 11 : 13;
    const quando = new Date(p.createdAt || p.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    const tipo = p.tipo === 'mesa' ? 'MESA ' + pad(p.mesa) : p.tipo === 'delivery' ? 'ENTREGA' : 'RETIRADA';
    const g = p.pagamento || {};
    const linha = (a, b, cls) => '<div class="l' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><span>' + b + '</span></div>';
    const e = p.entrega;
    return '<!doctype html><html><head><meta charset="utf-8"><title>Pedido ' + p.numero + '</title><style>' +
      '@page{size:' + mm + 'mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}' +
      'body{width:' + mm + 'mm;padding:3mm ' + (mm === 58 ? 2 : 4) + 'mm 6mm;font:' + fonte + 'px/1.35 "Courier New",ui-monospace,monospace}' +
      'h1{font-size:' + (fonte + 3) + 'px;margin:0;text-align:center}.c{text-align:center}.big{font-size:' + (fonte + 9) + 'px;font-weight:700;text-align:center;margin:2mm 0}' +
      '.tag{font-weight:700;text-align:center;border:2px solid #000;padding:1mm;margin:1.5mm 0}hr{border:0;border-top:1px dashed #000;margin:2mm 0}' +
      '.l{display:flex;justify-content:space-between;gap:2mm}.l span:last-child{white-space:nowrap}.it{margin:1mm 0}.it b{display:inline-block;min-width:7mm}.op{padding-left:7mm;font-size:' + (fonte - 1) + 'px}' +
      '.tot{font-weight:700;font-size:' + (fonte + 2) + 'px}.obs{border:1px solid #000;padding:1mm;margin-top:1.5mm;font-weight:700}' +
      '</style></head><body>' +
      '<h1>' + esc(rest && rest.nome) + '</h1><div class="c">' + quando + '</div>' +
      '<div class="big">PEDIDO #' + p.numero + '</div><div class="tag">' + tipo + (p.origem === 'totem' ? ' · TOTEM · ' + (p.consumo === 'viagem' ? 'PARA LEVAR' : 'COMER AQUI') : '') + '</div>' +
      (p.agendadoPara ? '<div class="tag">AGENDADO PARA ' + new Date(p.agendadoPara).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div>' : '') +
      '<div>Cliente: <b>' + esc(p.cliente && p.cliente.nome) + '</b></div>' + (p.cliente && p.cliente.tel ? '<div>Tel: ' + esc(p.cliente.tel) + '</div>' : '') +
      (e ? '<div>End.: <b>' + esc(e.endereco) + (e.complemento ? ', ' + esc(e.complemento) : '') + '</b></div><div>Bairro: ' + esc(e.bairro) + (e.km != null ? ' · ' + String(e.km).replace('.', ',') + ' km' : '') + '</div>' + (e.referencia ? '<div>Ref.: ' + esc(e.referencia) + '</div>' : '') : '') +
      '<hr>' + p.linhas.map(l => '<div class="it">' + linha('<b>' + l.qtd + 'x</b>' + esc(l.nome), brl(l.unit * l.qtd)) + (l.opcoes && l.opcoes.length ? '<div class="op">' + esc(l.opcoes.join(', ')) + '</div>' : '') + '</div>').join('') +
      (p.obs ? '<div class="obs">OBS: ' + esc(p.obs) + '</div>' : '') + '<hr>' +
      linha('Subtotal', brl(p.subtotal)) + (p.servico ? linha('Serviço', brl(p.servico)) : '') + (p.tipo === 'delivery' ? linha('Entrega', p.taxaEntrega ? brl(p.taxaEntrega) : 'Grátis') : '') +
      linha('TOTAL', brl(p.total), 'tot') + '<hr>' +
      '<div>Pagamento: ' + esc(PAG[g.metodo] || g.metodo) + '</div>' +
      (g.metodo === 'dinheiro' && g.troco > p.total ? '<div>Troco para ' + brl(g.troco) + ' (levar ' + brl(g.troco - p.total) + ')</div>' : '') +
      '<div class="tag">' + (g.pago ? 'PAGO' : p.tipo === 'delivery' ? 'COBRAR ' + brl(p.total) : 'A PAGAR') + '</div>' +
      '<div class="c" style="margin-top:3mm">Obrigado pela preferência!</div></body></html>';
  }

  // Imprime numa moldura invisível. Com o Chrome aberto em "modo quiosque de impressão", sai direto, sem janela.
  function imprimir(p, rest, largura) {
    return new Promise(res => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(f);
      const d = f.contentDocument; d.open(); d.write(html(p, rest, largura)); d.close();
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {}
        setTimeout(() => { f.remove(); res(); }, 1500);
      }, 150);
    });
  }
  w.Cupom = { html, imprimir };
})(window);
