/* Esconde a tela de carregamento quando a página termina de carregar (o texto provisório "data-carga" sai da tela) */
(function(){
'use strict';
const el = document.getElementById('carga'); if (!el) return;
let feito = false;
function esconder(){ if (feito) return; feito = true; ob.disconnect(); clearTimeout(t); el.classList.add('fora'); setTimeout(() => el.remove(), 400); }
const pronto = () => !document.querySelector('[data-carga]');
const ob = new MutationObserver(() => { if (pronto()) esconder(); });
ob.observe(document.body, { childList: true, subtree: true });
// servidor acordando (plano gratuito) ou internet lenta: avisa que está quase
const t = setTimeout(() => { const d = el.querySelector('.carga-demora'); if (d) d.hidden = false; }, 6000);
// se algo der muito errado, não prende a pessoa na tela de carregamento para sempre
setTimeout(esconder, 90000);
if (pronto()) esconder();
})();
