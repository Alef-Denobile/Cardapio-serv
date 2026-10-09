// Envio de e-mail (link de "Esqueci minha senha", faturas da mensalidade).
// EMAIL_PROVEDOR:
//   "log"    (padrão) só escreve o e-mail no log do servidor. Bom para testar.
//   "resend" usa a API do Resend (https://resend.com) por HTTPS. Funciona em qualquer hospedagem. Precisa de RESEND_API_KEY.
//   "smtp"   usa um servidor SMTP (Gmail, Zoho, Brevo...). Precisa de SMTP_HOST, SMTP_PORTA, SMTP_USUARIO e SMTP_SENHA.
//            Atenção: alguns planos de hospedagem bloqueiam as portas de SMTP; nesse caso use o Resend.
//   "off"    desliga o envio.
const config = require('../config');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transporte = null;
function smtp() {
  if (!transporte) {
    const nodemailer = require('nodemailer');
    const e = config.email;
    transporte = nodemailer.createTransport({ host: e.smtpHost, port: e.smtpPorta, secure: e.smtpPorta === 465, auth: e.smtpUsuario ? { user: e.smtpUsuario, pass: e.smtpSenha } : undefined });
  }
  return transporte;
}

// Monta um e-mail simples, com um botão
function modelo({ titulo, linhas, botao, link, rodape }) {
  const cor = '#E30613';
  const html = '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f1f1;font-family:Arial,Helvetica,sans-serif;color:#1D2142">' +
    '<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:14px;padding:28px 24px">' +
    '<h1 style="font-size:21px;margin:0 0 14px">' + esc(titulo) + '</h1>' +
    linhas.map(l => '<p style="font-size:15px;line-height:1.5;margin:0 0 12px">' + esc(l) + '</p>').join('') +
    (link ? '<p style="margin:22px 0"><a href="' + esc(link) + '" style="display:inline-block;background:' + cor + ';color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px">' + esc(botao) + '</a></p>' +
      '<p style="font-size:12.5px;color:#6B6F86;margin:0">Se o botão não funcionar, copie e cole no navegador:<br><span style="word-break:break-all">' + esc(link) + '</span></p>' : '') +
    '</div><p style="font-size:12px;color:#6B6F86;text-align:center;margin:14px 0 0">' + esc(rodape || 'Você recebeu este e-mail porque ele foi pedido no cardápio digital.') + '</p></div></body></html>';
  const texto = titulo + '\n\n' + linhas.join('\n\n') + (link ? '\n\n' + botao + ': ' + link : '') + '\n\n' + (rodape || '');
  return { html, texto };
}

// Nunca derruba quem chamou: devolve true/false
async function enviar({ para, assunto, titulo, linhas, botao, link, rodape }) {
  const prov = config.email.provedor, { html, texto } = modelo({ titulo: titulo || assunto, linhas, botao, link, rodape });
  try {
    if (!prov || prov === 'off') return false;
    if (prov === 'log') { // em produção não escreve o link (ele daria acesso à conta para quem lê o log)
      console.log('[E-mail] para ' + para + ' · ' + assunto + '\n' + (config.producao ? '(EMAIL_PROVEDOR=log: e-mail não enviado de verdade; link omitido)' : texto)); return !config.producao; }
    if (prov === 'resend') {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + config.email.resendChave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.email.remetente, to: [para], subject: assunto, html, text: texto }), signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('Resend respondeu ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return true;
    }
    if (prov === 'smtp') { await smtp().sendMail({ from: config.email.remetente, to: para, subject: assunto, html, text: texto }); return true; }
    console.error('EMAIL_PROVEDOR desconhecido: ' + prov);
    return false;
  } catch (e) { console.error('E-mail não enviado:', e.message); return false; }
}

const ativo = () => !!config.email.provedor && config.email.provedor !== 'off';

module.exports = { enviar, ativo, modelo };
