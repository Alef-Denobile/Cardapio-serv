// Cria uma conta de desenvolvedor para a área /admin.
// Uso: npm run novo-admin -- --nome "Seu Nome" --email voce@email.com --senha "senhaBemForte123"
// Esqueceu a senha de dev? npm run novo-admin -- --email voce@email.com --senha "novaSenhaForte123" --trocar-senha
const bcrypt = require('bcryptjs');
const { conectar, sistema, encerrar } = require('../db');
const config = require('../config');

(async () => {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { if (!a[i + 1] || a[i + 1].startsWith('--')) o[a[i].slice(2)] = true; else o[a[i].slice(2)] = a[i + 1], i++; }
  try {
    const trocar = o['trocar-senha'] === true;
    if (!o.email || !o.senha || (!trocar && !o.nome)) throw new Error(trocar ? 'Informe --email e --senha.' : 'Informe --nome, --email e --senha.');
    if (String(o.senha).length < 10) throw new Error('A senha de dev precisa ter pelo menos 10 caracteres.');
    await conectar();
    const email = o.email.toLowerCase(), hash = await bcrypt.hash(o.senha, 10);
    if (trocar) {
      const n = await sistema(async c => (await c.query('UPDATE admins SET senha_hash = $2 WHERE email = $1', [email, hash])).rowCount);
      if (!n) throw new Error('Nenhum dev com esse e-mail.');
      console.log(`\nSenha de ${email} trocada.\n`);
    } else {
    await sistema(async c => {
      if ((await c.query('SELECT 1 FROM admins WHERE email = $1', [email])).rowCount) throw new Error('Já existe um dev com esse e-mail.');
      await c.query('INSERT INTO admins (nome, email, senha_hash) VALUES ($1, $2, $3)', [o.nome, email, hash]);
    });
    console.log(`\nConta de dev criada para ${email}.`);
    console.log(`Área de devs: ${(config.urlPublica || 'http://localhost:' + config.porta)}/admin\n`);
    }
  } catch (e) { console.error('Não foi possível criar:', e.message); process.exitCode = 1; }
  await encerrar();
})();
