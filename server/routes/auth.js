const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { seedColunasPadrao } = require('../seed');
const { gerarSegredo, verificarCodigoTOTP, montarOtpAuthUri } = require('../utils/totp');
const { registrarAuditoria } = require('../utils/auditoria');

const router = express.Router();
const JWT_SECRET = auth.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function gerarToken(user) {
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '30d' });
}
// Token de curtíssima duração, só serve pra confirmar o código do 2FA logo após a
// senha ter sido validada — nunca dá acesso a nenhuma rota protegida normal.
function gerarTempToken2FA(user) {
  return jwt.sign({ sub: user._id.toString(), twofa: true }, JWT_SECRET, { expiresIn: '5m' });
}

// POST /api/auth/register -> cria a conta e já devolve o token (login automático)
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    }

    const emailNormalizado = email.toLowerCase().trim();
    const existente = await User.findOne({ email: emailNormalizado });
    if (existente) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const user = await User.create({ nome: (nome || '').trim(), email: emailNormalizado, senhaHash });

    // cada novo usuário começa com o funil padrão (Leads, Qualificação, etc.)
    await seedColunasPadrao(user._id);

    const token = gerarToken(user);
    res.status(201).json({ token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    if (!user.senhaHash) {
      return res.status(401).json({ error: 'Esta conta usa login com Google. Use o botão "Continuar com Google".' });
    }

    const senhaOk = await bcrypt.compare(senha, user.senhaHash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    if (user.twoFactorEnabled) {
      return res.json({ requiresTwoFactor: true, tempToken: gerarTempToken2FA(user) });
    }

    const token = gerarToken(user);
    registrarAuditoria(user._id, 'login', 'Login com e-mail e senha');
    res.json({ token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao entrar.' });
  }
});

// POST /api/auth/google -> login/cadastro usando o botão "Continuar com Google"
router.post('/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Login com Google não está configurado neste servidor.' });
    }
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial do Google ausente.' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ error: 'Não foi possível verificar sua conta Google.' });
    }

    const emailNormalizado = payload.email.toLowerCase().trim();
    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: emailNormalizado }] });

    if (user) {
      // conta já existia (por e-mail/senha, por exemplo) — só liga o Google a ela
      if (!user.googleId) {
        user.googleId = payload.sub;
        await user.save();
      }
    } else {
      user = await User.create({
        nome: payload.name || '',
        email: emailNormalizado,
        googleId: payload.sub,
        senhaHash: null,
      });
      await seedColunasPadrao(user._id);
    }

    const token = gerarToken(user);
    res.json({ token, user: user.toJSON() });
  } catch (err) {
    res.status(401).json({ error: 'Não foi possível entrar com o Google.' });
  }
});

// GET /api/auth/me -> dados do usuário logado (útil pra restaurar sessão)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

// POST /api/auth/logout-all -> invalida todos os tokens já emitidos (desconecta todos os dispositivos)
router.post('/logout-all', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
    registrarAuditoria(req.userId, 'logout_all', 'Desconectou todos os dispositivos');
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desconectar os dispositivos.' });
  }
});

// PUT /api/auth/avatar -> salva a foto de perfil (recebe um data URL já pequeno, gerado no navegador)
router.put('/avatar', auth, async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    if (avatarUrl && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(avatarUrl)) {
      return res.status(400).json({ error: 'Formato de imagem inválido.' });
    }
    if (avatarUrl && avatarUrl.length > 400000) {
      return res.status(400).json({ error: 'Imagem muito grande. Tente uma foto menor.' });
    }
    const user = await User.findByIdAndUpdate(req.userId, { avatarUrl: avatarUrl || null }, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a foto de perfil.' });
  }
});

// POST /api/auth/2fa/validar-login -> segunda etapa do login, confirma o código do app autenticador
router.post('/2fa/validar-login', async (req, res) => {
  try {
    const { tempToken, codigo } = req.body;
    if (!tempToken || !codigo) return res.status(400).json({ error: 'Informe o código do app autenticador.' });
    let payload;
    try {
      payload = jwt.verify(tempToken, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Sessão de login expirada. Faça login novamente.' });
    }
    if (!payload.twofa) return res.status(401).json({ error: 'Token inválido.' });
    const user = await User.findById(payload.sub);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ error: 'Não foi possível validar o código.' });
    }
    if (!verificarCodigoTOTP(user.twoFactorSecret, codigo)) {
      return res.status(401).json({ error: 'Código incorreto. Confira o app autenticador e tente de novo.' });
    }
    const token = gerarToken(user);
    registrarAuditoria(user._id, 'login', 'Login com e-mail, senha e verificação em duas etapas');
    res.json({ token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao validar o código.' });
  }
});

// POST /api/auth/2fa/iniciar -> gera um segredo novo (ainda não ativa) e devolve o QR code
router.post('/2fa/iniciar', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (user.twoFactorEnabled) return res.status(400).json({ error: 'A verificação em duas etapas já está ativada.' });
    const segredo = gerarSegredo();
    user.twoFactorSecret = segredo;
    await user.save();
    const otpauthUri = montarOtpAuthUri(segredo, user.email, 'Painel CRM');
    res.json({ segredo, otpauthUri });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao iniciar a configuração do 2FA.' });
  }
});

// POST /api/auth/2fa/confirmar -> confirma o primeiro código gerado e ativa de vez
router.post('/2fa/confirmar', auth, async (req, res) => {
  try {
    const { codigo } = req.body;
    const user = await User.findById(req.userId);
    if (!user || !user.twoFactorSecret) return res.status(400).json({ error: 'Inicie a configuração do 2FA primeiro.' });
    if (!verificarCodigoTOTP(user.twoFactorSecret, codigo)) {
      return res.status(401).json({ error: 'Código incorreto. Confira o app autenticador e tente de novo.' });
    }
    user.twoFactorEnabled = true;
    await user.save();
    registrarAuditoria(req.userId, '2fa_ativado', 'Verificação em duas etapas ativada');
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao confirmar o 2FA.' });
  }
});

// POST /api/auth/2fa/desativar -> exige o código atual pra desligar (evita alguém desligar por acidente/sem acesso)
router.post('/2fa/desativar', auth, async (req, res) => {
  try {
    const { codigo } = req.body;
    const user = await User.findById(req.userId);
    if (!user || !user.twoFactorEnabled) return res.status(400).json({ error: 'A verificação em duas etapas não está ativada.' });
    if (!verificarCodigoTOTP(user.twoFactorSecret, codigo)) {
      return res.status(401).json({ error: 'Código incorreto.' });
    }
    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();
    registrarAuditoria(req.userId, '2fa_desativado', 'Verificação em duas etapas desativada');
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar o 2FA.' });
  }
});

// PUT /api/auth/nome -> muda o nome de exibição da conta
router.put('/nome', auth, async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Digite um nome.' });
    const user = await User.findByIdAndUpdate(req.userId, { nome: nome.trim() }, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar o nome.' });
  }
});

// PUT /api/auth/agendamento-publico -> configura o link público de agendamento (o próprio usuário)
router.put('/agendamento-publico', auth, async (req, res) => {
  try {
    const { ativo, horaInicio, horaFim, duracaoMinutos, diasSemana, colunaDestinoId } = req.body;
    const updates = {};
    if (typeof ativo === 'boolean') updates['agendamentoPublico.ativo'] = ativo;
    if (horaInicio) updates['agendamentoPublico.horaInicio'] = horaInicio;
    if (horaFim) updates['agendamentoPublico.horaFim'] = horaFim;
    if (duracaoMinutos) updates['agendamentoPublico.duracaoMinutos'] = Number(duracaoMinutos);
    if (Array.isArray(diasSemana)) updates['agendamentoPublico.diasSemana'] = diasSemana.map(Number);
    if (colunaDestinoId !== undefined) updates['agendamentoPublico.colunaDestinoId'] = colunaDestinoId || null;

    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a configuração de agendamento.' });
  }
});

// PUT /api/auth/password -> troca (ou define, se a conta só tinha login com Google) a senha
router.put('/password', auth, async (req, res) => {
  try {
    const { senhaAtual, senhaNova } = req.body;
    if (!senhaNova || senhaNova.length < 6) {
      return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres.' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (user.senhaHash) {
      if (!senhaAtual) return res.status(400).json({ error: 'Informe a senha atual.' });
      const ok = await bcrypt.compare(senhaAtual, user.senhaHash);
      if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    user.senhaHash = await bcrypt.hash(senhaNova, 10);
    await user.save();
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar a senha.' });
  }
});

module.exports = router;
