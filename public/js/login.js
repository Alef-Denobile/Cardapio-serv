/* ================================================================
   Tela de login / cadastro
================================================================ */
const API_BASE = '/api';
let modo = 'login'; // ou 'register'

// mesma cor de destaque escolhida no painel (guardada no navegador)
document.documentElement.style.setProperty('--accent', localStorage.getItem('accentColor') || '#141414');
// mesmo modo noturno escolhido no painel
document.documentElement.setAttribute('data-theme', localStorage.getItem('darkMode') === '1' ? 'dark' : 'light');

const form = document.getElementById('auth-form');
const errorBox = document.getElementById('auth-error');
const submitBtn = document.getElementById('auth-submit');
const fieldNome = document.getElementById('field-nome');
const twofaForm = document.getElementById('twofa-form');
const twofaSubmitBtn = document.getElementById('twofa-submit');
const authDivider = document.getElementById('auth-divider');
const googleBtnContainer = document.getElementById('google-btn-container');
let tempToken2FA = null;

/* se já tem sessão, pula direto pro painel */
if(localStorage.getItem('token')){
  window.location.href = 'index.html';
}

document.querySelectorAll('.auth-tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    modo = btn.dataset.mode;
    document.querySelectorAll('.auth-tab').forEach(b=> b.classList.toggle('active', b===btn));
    fieldNome.style.display = modo==='register' ? 'block' : 'none';
    submitBtn.textContent = modo==='register' ? 'Criar conta' : 'Entrar';
    errorBox.style.display = 'none';
  });
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  errorBox.style.display = 'none';
  submitBtn.disabled = true;

  const email = document.getElementById('a-email').value.trim();
  const senha = document.getElementById('a-senha').value;
  const nome = document.getElementById('a-nome').value.trim();

  const path = modo==='register' ? '/auth/register' : '/auth/login';
  const body = modo==='register' ? { nome, email, senha } : { email, senha };

  try{
    const res = await fetch(API_BASE + path, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || 'Não foi possível concluir. Tente novamente.'); }

    if(data.requiresTwoFactor){
      tempToken2FA = data.tempToken;
      form.style.display = 'none';
      authDivider.style.display = 'none';
      googleBtnContainer.style.display = 'none';
      twofaForm.style.display = 'block';
      const codigoInput = document.getElementById('twofa-codigo');
      codigoInput.focus();
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'index.html';
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }finally{
    submitBtn.disabled = false;
  }
});

twofaForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  errorBox.style.display = 'none';
  twofaSubmitBtn.disabled = true;
  const codigo = document.getElementById('twofa-codigo').value.trim();
  try{
    const res = await fetch(API_BASE + '/auth/2fa/validar-login', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ tempToken: tempToken2FA, codigo }),
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || 'Código incorreto.'); }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'index.html';
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }finally{
    twofaSubmitBtn.disabled = false;
  }
});

/* ---------- "Continuar com Google" ----------
   O Client ID vem do servidor (GET /api/config/integracoes), não fica fixo aqui — assim,
   cada empresa que instalar esse painel configura o Google dela só com variáveis de
   ambiente (mesmo GOOGLE_CLIENT_ID que a sincronização com a Google Agenda já usa), sem
   precisar editar código. Client ID não é segredo, só o Client Secret é — é normal ele
   rodar no navegador. */
function initGoogleButton(clientId){
  if(!clientId){
    const fallback = document.getElementById('google-btn-fallback');
    if(fallback) fallback.style.display = 'block';
    return;
  }
  if(!window.google || !window.google.accounts){
    setTimeout(()=> initGoogleButton(clientId), 300);
    return;
  }
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-btn-container'),
    { theme:'outline', size:'large', width:320, text:'continue_with', locale:'pt-BR' }
  );
}
fetch(API_BASE + '/config/integracoes')
  .then(res=> res.ok ? res.json() : {})
  .then(cfg=> initGoogleButton(cfg.googleClientId || ''))
  .catch(()=> initGoogleButton(''));

async function handleGoogleCredential(response){
  errorBox.style.display = 'none';
  try{
    const res = await fetch(API_BASE + '/auth/google', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();
    if(!res.ok){ throw new Error(data.error || 'Não foi possível entrar com o Google.'); }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = 'index.html';
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
}
