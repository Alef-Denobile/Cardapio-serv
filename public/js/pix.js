/* Pix automático na tela do cliente: QR Code, copia e cola, tempo para pagar e (no modo demo) "Simular pagamento".
   Usado pelo site (pedido online), pelo cardápio do salão e pelo totem. Precisa do /js/qrcode.js antes. */
(function (w) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  function qr(texto) {
    if (typeof qrcode !== 'function') return '';
    const q = qrcode(0, 'M'); q.addData(texto, 'Byte'); q.make(); const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + 4) + ' ' + (r + 4) + 'h1v1h-1z';
    return '<svg class="px-qr" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" role="img" aria-label="QR Code do Pix" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
  }
  const resta = em => Math.max(0, Math.floor((new Date(em).getTime() - Date.now()) / 1000));
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  // p: pedido (com p.pagamento.pix); cod: código de acompanhamento (para o botão de demonstração)
  function bloco(p, cod, opc) {
    const x = p.pagamento && p.pagamento.pix; if (!x) return '';
    const g = opc && opc.grande;
    return '<div class="px' + (g ? ' px-g' : '') + '" data-pix-ped="' + esc(p.id) + '">' +
      '<div class="px-topo"><strong>Pague ' + brl(p.total) + ' com Pix</strong><span class="px-tempo" data-pix-expira="' + esc(x.expiraEm) + '">' + mmss(resta(x.expiraEm)) + '</span></div>' +
      (x.demo ? '<p class="px-demo">Demonstração: este Pix não tem valor. Não pague.</p>' : '') +
      '<div class="px-corpo">' + qr(x.copiaECola) + '<div class="px-pass"><ol><li>Abra o app do seu banco e escolha <strong>Pix</strong>.</li><li>Aponte a câmera para o QR Code ou use o <strong>Pix copia e cola</strong>.</li><li>' + esc((opc && opc.passo3) || 'Pronto: o pedido vai para a cozinha sozinho, assim que o Pix cair.') + '</li></ol>' +
      '<div class="px-cc"><code>' + esc(x.copiaECola.slice(0, 38)) + '…</code><button type="button" class="px-bt" data-pix-copiar="' + esc(x.copiaECola) + '">Copiar código</button></div>' +
      (x.demo && cod ? '<button type="button" class="px-bt px-sim" data-pix-demo="' + esc(p.id) + '" data-c="' + esc(cod) + '"' + (opc && opc.demoUrl ? ' data-url="' + esc(opc.demoUrl) + '"' : '') + '>Simular pagamento (demonstração)</button>' : '') +
      '<p class="px-esp"><span class="px-ponto" aria-hidden="true"></span>Esperando o pagamento…</p></div></div></div>';
  }

  // Liga os botões e o relógio. aoPagar(pedido) é chamado quando o modo demo aprova.
  let aoPagar = null;
  function ligar(fn) { aoPagar = fn; }
  document.addEventListener('click', async e => {
    const cp = e.target.closest('[data-pix-copiar]');
    if (cp) {
      const t = cp.dataset.pixCopiar;
      try { await navigator.clipboard.writeText(t); } catch (er) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (x) {} a.remove(); }
      const old = cp.textContent; cp.textContent = 'Copiado!'; setTimeout(() => { cp.textContent = old; }, 1800); return;
    }
    const dm = e.target.closest('[data-pix-demo]');
    if (dm) {
      dm.disabled = true;
      try {
        const r = await fetch(dm.dataset.url || '/api/pix/demo/' + encodeURIComponent(dm.dataset.pixDemo), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: dm.dataset.c }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || 'Não foi possível simular.');
        if (aoPagar && (d.pedido || d.fatura)) aoPagar(d.pedido || d.fatura);
      } catch (er) { dm.disabled = false; alert(er.message); }
    }
  });
  setInterval(() => {
    document.querySelectorAll('[data-pix-expira]').forEach(el => { const s = resta(el.dataset.pixExpira); el.textContent = s ? mmss(s) : 'tempo esgotado'; el.classList.toggle('acabando', s < 120); });
  }, 1000);

  const css = document.createElement('style');
  css.textContent = '.px{border:2px solid var(--cor,var(--red,#E30613));border-radius:16px;padding:14px;background:var(--papel,var(--surface,#fff));color:var(--tinta,var(--ink,#1D2142));text-align:left}' +
    '.px-topo{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:17px}.px-tempo{font-weight:900;font-variant-numeric:tabular-nums;background:var(--chip,#F6EEEE);border-radius:999px;padding:3px 10px;font-size:14px}.px-tempo.acabando{background:#FDE2E2;color:#B3000F}' +
    '.px-demo{margin:8px 0 0;font-size:13px;font-weight:800;color:#8A4B00;background:#FBEEDC;border-radius:8px;padding:6px 10px}' +
    '.px-corpo{display:grid;grid-template-columns:170px minmax(0,1fr);gap:16px;align-items:center;margin-top:10px}.px-qr{width:170px;height:170px;border-radius:10px;border:1px solid #ddd;background:#fff}' +
    '.px-pass ol{margin:0;padding-left:18px;font-size:14px;line-height:1.45}.px-pass li{margin:2px 0}.px-cc{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}.px-cc code{font-size:12px;background:var(--chip,#F6EEEE);border-radius:6px;padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;min-width:0;flex:1}' +
    '.px-bt{border:0;border-radius:10px;background:var(--cor,var(--red,#E30613));color:#fff;font:inherit;font-weight:800;padding:10px 14px;cursor:pointer}.px-sim{margin-top:8px;background:#1F8A4C;width:100%}' +
    '.px-esp{display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:13.5px;font-weight:700;color:var(--suave,var(--muted,#6B6F86))}.px-ponto{width:10px;height:10px;border-radius:50%;background:#F2B42C;animation:pxp 1.2s infinite}' +
    '@keyframes pxp{50%{opacity:.25}}@media (prefers-reduced-motion:reduce){.px-ponto{animation:none}}' +
    '.px-g .px-topo{font-size:26px}.px-g .px-corpo{grid-template-columns:300px minmax(0,1fr);gap:28px}.px-g .px-qr{width:300px;height:300px}.px-g .px-pass ol{font-size:20px}.px-g .px-bt{padding:16px 22px;font-size:19px}.px-g .px-esp{font-size:19px}.px-g .px-tempo{font-size:20px}' +
    '@media (max-width:560px){.px-corpo,.px-g .px-corpo{grid-template-columns:1fr;justify-items:center}.px-qr{width:200px;height:200px}}';
  document.head.appendChild(css);

  w.Pix = { bloco, ligar, qr };
})(window);
