/* Página do link de "Esqueci minha senha": cria a senha nova */
(function(){
'use strict';
const { $, esc, api, aplicarCor } = C;
const qs = new URLSearchParams(location.search), token = qs.get('t') || '', slug = (qs.get('r') || '').replace(/[^a-z0-9-]/g, '');
// tira o código da barra de endereço (não fica no histórico nem em print de tela)
try { history.replaceState(null, '', location.pathname); } catch (e) {}
aplicarCor('#E30613');
let tipo = 'usuario';

function fim(html){ $('#f-senha').hidden = true; $('#sub').hidden = true; const b = $('#s-fim'); b.hidden = false; b.innerHTML = html; }
const voltar = () => tipo === 'cliente' ? (slug ? '/r/' + encodeURIComponent(slug) : '/') : '/painel';

(async function(){
  if (!token){ fim('<p style="margin:0">Este link está incompleto. Abra de novo o link do e-mail ou peça um novo em "Esqueci minha senha".</p>'); return; }
  try {
    const d = await api('POST', '/api/senha/validar', { t: token });
    if (!d.valido){ fim('<p style="margin:0 0 12px">Este link expirou ou já foi usado.</p><p class="note" style="margin:0">Peça um novo em "Esqueci minha senha". Cada link vale por 1 hora e funciona uma vez.</p>'); return; }
    tipo = d.tipo;
    $('#sub').textContent = 'Conta ' + d.email + (tipo === 'usuario' ? ' (painel do restaurante)' : '');
    $('#f-senha').hidden = false; $('#s-nova').focus();
  } catch (e) { fim('<p class="erro" style="margin:0">' + esc(e.message) + '</p>'); }
})();

$('#s-ver').addEventListener('change', e => { ['#s-nova', '#s-conf'].forEach(s => { $(s).type = e.target.checked ? 'text' : 'password'; }); });
$('#f-senha').addEventListener('submit', async e => {
  e.preventDefault();
  const n = $('#s-nova').value, c = $('#s-conf').value, er = $('#s-erro'), b = $('#s-btn');
  er.hidden = true;
  const erro = t => { er.hidden = false; er.textContent = t; };
  if (n.length < 8) return erro('A senha nova precisa ter pelo menos 8 caracteres.');
  if (n !== c) return erro('As duas senhas não são iguais.');
  b.disabled = true; b.textContent = 'Salvando…';
  try {
    await api('POST', '/api/senha/redefinir', { token, senha: n });
    fim('<p style="margin:0 0 14px"><strong>Pronto! Sua senha nova está valendo.</strong></p><a class="btn" href="' + esc(voltar()) + '">' + (tipo === 'cliente' ? 'Voltar ao cardápio e entrar' : 'Entrar no painel') + '</a>');
  } catch (err) { erro(err.message); b.disabled = false; b.textContent = 'Salvar senha nova'; }
});
})();
document.addEventListener('input', () => { C.$('#s-erro').hidden = true; });
