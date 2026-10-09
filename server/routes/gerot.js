const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const GerotBloco = require('../models/GerotBloco');

const router = express.Router();
router.use(auth);

const HORARIOS_INICIO = [];
for (let h = 8; h <= 19; h++) {
  HORARIOS_INICIO.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 19) HORARIOS_INICIO.push(`${String(h).padStart(2, '0')}:30`);
}
const HORARIOS_FIM = [...HORARIOS_INICIO.slice(1), '19:30']; // fim pode ir meia hora além do último início (a última linha da grade)

// GET /api/gerot/:semanaInicio -> todos os blocos daquela semana (YYYY-MM-DD de uma segunda-feira)
router.get('/:semanaInicio', async (req, res) => {
  try {
    const blocos = await GerotBloco.find({ userId: req.userId, semanaInicio: req.params.semanaInicio });
    res.json({ blocos: blocos.map((b) => b.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o GEROT.' });
  }
});

// PUT /api/gerot -> cria ou edita um bloco (um intervalo de horário); se blocoId vier, edita esse bloco
router.put('/', async (req, res) => {
  try {
    const { semanaInicio, diaSemana, horarioInicio, horarioFim, texto, blocoId } = req.body;
    if (!semanaInicio || diaSemana == null || !horarioInicio || !horarioFim) {
      return res.status(400).json({ error: 'Dados incompletos.' });
    }
    if (!HORARIOS_INICIO.includes(horarioInicio) || !HORARIOS_FIM.includes(horarioFim)) {
      return res.status(400).json({ error: 'Horário inválido.' });
    }
    if (horarioFim <= horarioInicio) {
      return res.status(400).json({ error: 'O horário final precisa ser depois do inicial.' });
    }
    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Escreva a atividade desse bloco.' });
    }
    if (blocoId && !mongoose.isValidObjectId(blocoId)) {
      return res.status(400).json({ error: 'Bloco inválido.' });
    }

    // checa se esse intervalo bate de frente com outro bloco já existente no mesmo dia
    const outrosNoDia = await GerotBloco.find({
      userId: req.userId, semanaInicio, diaSemana,
      ...(blocoId ? { _id: { $ne: blocoId } } : {}),
    });
    const sobrepoe = outrosNoDia.some((b) => horarioInicio < b.horarioFim && horarioFim > b.horarioInicio);
    if (sobrepoe) {
      return res.status(409).json({ error: 'Esse intervalo bate de frente com outro bloco já preenchido nesse dia.' });
    }

    let bloco;
    if (blocoId) {
      bloco = await GerotBloco.findOneAndUpdate(
        { _id: blocoId, userId: req.userId },
        { horarioInicio, horarioFim, texto: texto.trim() },
        { new: true, runValidators: true }
      );
      if (!bloco) return res.status(404).json({ error: 'Bloco não encontrado.' });
    } else {
      bloco = await GerotBloco.create({ userId: req.userId, semanaInicio, diaSemana, horarioInicio, horarioFim, texto: texto.trim() });
    }
    res.json(bloco.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar o bloco do GEROT.' });
  }
});

// DELETE /api/gerot/:id -> apaga um bloco
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bloco inválido.' });
    await GerotBloco.deleteOne({ _id: req.params.id, userId: req.userId });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar o bloco.' });
  }
});

// POST /api/gerot/copiar -> copia todos os blocos de uma semana pra outra (não sobrescreve a de destino, só preenche o que estiver livre)
router.post('/copiar', async (req, res) => {
  try {
    const { semanaOrigem, semanaDestino } = req.body;
    if (!semanaOrigem || !semanaDestino) return res.status(400).json({ error: 'Semanas de origem e destino são obrigatórias.' });

    const blocosOrigem = await GerotBloco.find({ userId: req.userId, semanaInicio: semanaOrigem });
    if (!blocosOrigem.length) return res.json({ copiados: 0 });

    const blocosDestinoExistentes = await GerotBloco.find({ userId: req.userId, semanaInicio: semanaDestino });

    let copiados = 0;
    for (const b of blocosOrigem) {
      // não copia se já existir QUALQUER bloco desse dia que bata de frente no destino
      const bate = blocosDestinoExistentes.some((d) => d.diaSemana === b.diaSemana && b.horarioInicio < d.horarioFim && b.horarioFim > d.horarioInicio);
      if (bate) continue;
      await GerotBloco.create({ userId: req.userId, semanaInicio: semanaDestino, diaSemana: b.diaSemana, horarioInicio: b.horarioInicio, horarioFim: b.horarioFim, texto: b.texto });
      copiados++;
    }
    res.json({ copiados });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao copiar a semana.' });
  }
});

module.exports = router;
