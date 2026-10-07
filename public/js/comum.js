/* Utilidades compartilhadas pelo cardápio e pelo painel */
(function (w) {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const hora = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function ago(ts){ const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000); if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min'; return 'há ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
  function initials(n){ return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
  function toast(t){ const el = $('#toast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3000); }
  function lum(hex){ const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0; const n = parseInt(m[1], 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
  function aplicarCor(cor){ const b = /^#[0-9a-f]{6}$/i.test(cor || '') ? cor : '#D23F3F'; const st = document.documentElement.style; st.setProperty('--brand', b); st.setProperty('--brand-ink', lum(b) > .4 ? '#141816' : '#FFFFFF'); }
  const ICONES = [
    '<path d="M8 22h32l-3 13a5 5 0 0 1-5 4H16a5 5 0 0 1-5-4z"/><path d="M17 22l6-11M31 22l-6-11"/>',
    '<circle cx="27" cy="25" r="12"/><circle cx="27" cy="25" r="6.5"/><path d="M9 11v27M6.5 11v7a2.5 2.5 0 0 0 5 0v-7"/>',
    '<path d="M8 36h32V25L8 17z"/><path d="M8 27h32"/><circle cx="30" cy="13" r="2.5"/>',
    '<path d="M15 8h18l-3 32H18z"/><path d="M16 18h16"/><path d="M29 8l5-4"/>'
  ];
  function foto(p, idxCategoria){
    if (p.fotoUrl) return '<img src="' + esc(p.fotoUrl) + '" alt="" loading="lazy">';
    const ic = ICONES[idxCategoria >= 0 && idxCategoria < 4 ? idxCategoria : 1];
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic + '</svg>';
  }
  async function api(metodo, url, corpo, token){
    let r;
    try {
      r = await fetch(url, { method: metodo, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
    } catch (e) { throw Object.assign(new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'), { status: 0 }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erro || 'Algo deu errado. Tente de novo.'), { status: r.status });
    return d;
  }
  const guardar = {
    ler(k, padrao){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } },
    gravar(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    apagar(k){ try { localStorage.removeItem(k); } catch (e) {} }
  };
  function copiar(texto){ const f = () => toast('Copiado'); try { navigator.clipboard.writeText(texto).then(f, () => toast('Selecione e copie o texto')); } catch (e) { toast('Selecione e copie o texto'); } }
  const STATUS = { aguardando: 'Aguardando pagamento', novo: 'Novo', preparo: 'Em preparo', pronto: 'Pronto', rota: 'Saiu para entrega', entregue: 'Finalizado', cancelado: 'Cancelado' };
  function pagTxt(p){ const m = p.pagamento && p.pagamento.metodo; return m === 'online' ? 'Pago pelo site' : m === 'pix' ? 'Pix' : m === 'cartao' ? 'Cartão na entrega' : m === 'dinheiro' ? 'Dinheiro' : p.tipo === 'mesa' ? 'Pagar na mesa' : 'Pagar na retirada'; }
  function trocoTxt(p){ const g = p.pagamento || {}; if (g.metodo !== 'dinheiro') return ''; return g.troco > p.total ? 'Levar troco para ' + brl(g.troco) + ' (troco de ' + brl(g.troco - p.total) + ')' : 'Dinheiro, sem troco'; }
  // "Esqueci minha senha" das telas de login: mostra quem pode criar uma senha nova (sem e-mail automático)
  function ajudaSenha(texto){
    const b = $('#l-esqueci'), box = $('#l-ajuda'); if (!b || !box) return;
    b.addEventListener('click', async () => {
      const abrir = box.hidden; box.hidden = !abrir; b.setAttribute('aria-expanded', String(abrir)); if (!abrir) return;
      box.innerHTML = esc(texto);
      try { const s = await api('GET', '/api/suporte');
        const c = [s.whatsapp ? '<a href="https://wa.me/' + esc(s.whatsapp) + '" target="_blank" rel="noopener">WhatsApp do suporte</a>' : '', s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>' : ''].filter(Boolean);
        if (c.length) box.innerHTML += '<br>Suporte: ' + c.join(' · ');
      } catch (e) {}
    });
  }
  w.C = { ajudaSenha, $, $$, esc, brl, norm, pad, hora, ago, initials, toast, lum, aplicarCor, foto, api, guardar, copiar, STATUS, pagTxt, trocoTxt };
})(window);
