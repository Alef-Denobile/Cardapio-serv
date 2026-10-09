const express = require('express');
const auth = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

const router = express.Router();
router.use(auth); // exige login

// GET /api/auditoria -> últimos 100 eventos da própria conta, mais recentes primeiro
router.get('/', async (req, res) => {
  try {
    const eventos = await AuditLog.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100);
    res.json({ eventos: eventos.map((e) => e.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o log de auditoria.' });
  }
});

module.exports = router;
