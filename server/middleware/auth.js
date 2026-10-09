const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-no-env';

// Protege rotas: exige um header "Authorization: Bearer <token>" válido.
// Também confere se o token ainda é a versão mais recente do usuário — permite
// "desconectar todos os dispositivos" sem precisar guardar sessão nenhuma.
// Em caso de sucesso, disponibiliza req.userId para a rota usar.
module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.twofa) {
      // token temporário de 2FA — só serve pra validar o código, nunca pra acessar rotas normais
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    const user = await User.findById(payload.sub).select('tokenVersion');
    if (!user) return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Sessão encerrada em outro dispositivo. Faça login novamente.' });
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }
};

module.exports.JWT_SECRET = JWT_SECRET;
