const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Equipe = require('../models/Equipe');
const ChatMensagem = require('../models/ChatMensagem');
const Card = require('../models/Card');
const Column = require('../models/Column');
const MetaVendasEquipe = require('../models/MetaVendasEquipe');
const MetaVendas = require('../models/MetaVendas');
const Task = require('../models/Task');
const { registrarAuditoria } = require('../utils/auditoria');

const router = express.Router();
router.use(auth); // todas as rotas de equipe exigem login

// GET /api/equipe -> dados da equipe do usuário logado (null se ele não fizer parte de nenhuma)
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.equipeId) return res.json({ equipe: null });

    const equipe = await Equipe.findById(user.equipeId);
    if (!equipe) return res.json({ equipe: null });

    const membros = await User.find({ equipeId: equipe._id }).select('nome email papelEquipe supervisorDeDados');
    const souSupervisor = user.papelEquipe === 'supervisor';

    res.json({
      equipe: {
        id: equipe._id.toString(),
        nome: equipe.nome,
        codigoConvite: souSupervisor ? equipe.codigoConvite : null,
        souDono: equipe.donoId.toString() === req.userId,
        souSupervisor,
        souSupervisorDeDados: !!user.supervisorDeDados,
        membros: membros.map((m) => ({
          id: m._id.toString(),
          nome: m.nome,
          email: m.email,
          papel: m.papelEquipe,
          supervisorDeDados: !!m.supervisorDeDados,
          souEu: m._id.toString() === req.userId,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a equipe.' });
  }
});

// POST /api/equipe -> cria uma equipe nova (quem cria vira supervisor(a))
router.post('/', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome da equipe é obrigatório.' });

    const user = await User.findById(req.userId);
    if (user.equipeId) return res.status(400).json({ error: 'Você já faz parte de uma equipe. Saia dela antes de criar outra.' });

    const equipe = await Equipe.create({ nome: nome.trim(), donoId: req.userId });
    user.equipeId = equipe._id;
    user.papelEquipe = 'supervisor';
    user.supervisorDeDados = true;
    await user.save();

    res.status(201).json({ id: equipe._id.toString(), nome: equipe.nome, codigoConvite: equipe.codigoConvite });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar equipe.' });
  }
});

// POST /api/equipe/entrar -> entra numa equipe existente usando o código de convite (vira membro)
router.post('/entrar', async (req, res) => {
  try {
    const { codigo } = req.body;
    if (!codigo || !codigo.trim()) return res.status(400).json({ error: 'Informe o código de convite.' });

    const user = await User.findById(req.userId);
    if (user.equipeId) return res.status(400).json({ error: 'Você já faz parte de uma equipe. Saia dela antes de entrar em outra.' });

    const equipe = await Equipe.findOne({ codigoConvite: codigo.trim().toUpperCase() });
    if (!equipe) return res.status(404).json({ error: 'Código de convite inválido.' });

    user.equipeId = equipe._id;
    user.papelEquipe = 'membro';
    await user.save();

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao entrar na equipe.' });
  }
});

// POST /api/equipe/sair -> sai da equipe atual (o funil da pessoa continua intocado)
router.post('/sair', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });

    const equipe = await Equipe.findById(user.equipeId);
    const eraDono = equipe && equipe.donoId.toString() === req.userId;

    user.equipeId = null;
    user.papelEquipe = 'membro';
    await user.save();

    if (eraDono && equipe) {
      const restantes = await User.find({ equipeId: equipe._id });
      if (!restantes.length) {
        // ninguém mais na equipe — apaga a equipe e o histórico do chat dela
        await Equipe.findByIdAndDelete(equipe._id);
        await ChatMensagem.deleteMany({ equipeId: equipe._id });
      } else {
        // passa a "dona" pra outro supervisor, ou promove o primeiro membro que sobrou
        const novoDono = restantes.find((m) => m.papelEquipe === 'supervisor') || restantes[0];
        equipe.donoId = novoDono._id;
        await equipe.save();
        if (novoDono.papelEquipe !== 'supervisor') {
          novoDono.papelEquipe = 'supervisor';
          await novoDono.save();
        }
      }
    }

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao sair da equipe.' });
  }
});

// POST /api/equipe/regenerar-codigo -> gera um novo código de convite (só supervisor)
router.post('/regenerar-codigo', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId || user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só supervisores podem gerar um novo código.' });
    }
    const equipe = await Equipe.findById(user.equipeId);
    equipe.codigoConvite = Equipe.gerarCodigo();
    await equipe.save();
    res.json({ codigoConvite: equipe.codigoConvite });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar novo código.' });
  }
});

// PUT /api/equipe/membro/:userId/papel -> promove ou rebaixa um membro (só supervisor)
router.put('/membro/:userId/papel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: 'ID inválido.' });
    const user = await User.findById(req.userId);
    if (!user.equipeId || user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só supervisores podem alterar papéis.' });
    }
    const { papel } = req.body;
    if (!['supervisor', 'membro'].includes(papel)) return res.status(400).json({ error: 'Papel inválido.' });

    const alvo = await User.findOne({ _id: req.params.userId, equipeId: user.equipeId });
    if (!alvo) return res.status(404).json({ error: 'Membro não encontrado nesta equipe.' });

    alvo.papelEquipe = papel;
    await alvo.save();
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar o papel do membro.' });
  }
});

// PUT /api/equipe/membro/:userId/supervisor-dados -> concede ou revoga acesso ao
// monitoramento de erros (separado do papel de gestor da equipe; só gestor concede)
router.put('/membro/:userId/supervisor-dados', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: 'ID inválido.' });
    const user = await User.findById(req.userId);
    if (!user.equipeId || user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só o gestor da equipe pode conceder esse acesso.' });
    }
    const { ativo } = req.body;
    const alvo = await User.findOne({ _id: req.params.userId, equipeId: user.equipeId });
    if (!alvo) return res.status(404).json({ error: 'Membro não encontrado nesta equipe.' });

    alvo.supervisorDeDados = !!ativo;
    await alvo.save();
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar o acesso de supervisor de dados.' });
  }
});

// DELETE /api/equipe/membro/:userId -> remove um membro da equipe (só supervisor; o funil dele fica intacto)
router.delete('/membro/:userId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: 'ID inválido.' });
    const user = await User.findById(req.userId);
    if (!user.equipeId || user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só supervisores podem remover membros.' });
    }
    if (req.params.userId === req.userId) {
      return res.status(400).json({ error: 'Use "Sair da equipe" para se remover.' });
    }
    const alvo = await User.findOne({ _id: req.params.userId, equipeId: user.equipeId });
    if (!alvo) return res.status(404).json({ error: 'Membro não encontrado nesta equipe.' });

    alvo.equipeId = null;
    alvo.papelEquipe = 'membro';
    await alvo.save();
    registrarAuditoria(req.userId, 'membro_removido', `Removeu "${alvo.nome || alvo.email}" da equipe`);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover o membro.' });
  }
});

// GET /api/equipe/chat -> mensagens do chat interno da equipe
router.get('/chat', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });

    const mensagens = await ChatMensagem.find({ equipeId: user.equipeId, destinatarioId: null }).sort({ timestamp: 1 }).limit(200);
    res.json({ mensagens: mensagens.map((m) => m.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o chat.' });
  }
});

// POST /api/equipe/chat -> envia uma mensagem no chat interno (da equipe toda)
router.post('/chat', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });

    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Mensagem vazia.' });

    const msg = await ChatMensagem.create({
      equipeId: user.equipeId,
      remetenteId: req.userId,
      remetenteNome: user.nome || user.email,
      texto: texto.trim(),
    });
    res.status(201).json(msg.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar a mensagem.' });
  }
});

// GET /api/equipe/chat/:userId -> histórico da conversa privada com um colega específico
router.get('/chat/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });
    const outroId = req.params.userId;
    const outro = await User.findOne({ _id: outroId, equipeId: user.equipeId });
    if (!outro) return res.status(404).json({ error: 'Esse colega não faz parte da sua equipe.' });

    const mensagens = await ChatMensagem.find({
      equipeId: user.equipeId,
      $or: [
        { remetenteId: req.userId, destinatarioId: outroId },
        { remetenteId: outroId, destinatarioId: req.userId },
      ],
    }).sort({ timestamp: 1 }).limit(200);
    res.json({ mensagens: mensagens.map((m) => m.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a conversa.' });
  }
});

// POST /api/equipe/chat/:userId -> envia uma mensagem privada pra um colega específico
router.post('/chat/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });
    const outroId = req.params.userId;
    const outro = await User.findOne({ _id: outroId, equipeId: user.equipeId });
    if (!outro) return res.status(404).json({ error: 'Esse colega não faz parte da sua equipe.' });

    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Mensagem vazia.' });

    const msg = await ChatMensagem.create({
      equipeId: user.equipeId,
      remetenteId: req.userId,
      remetenteNome: user.nome || user.email,
      destinatarioId: outroId,
      texto: texto.trim(),
    });
    res.status(201).json(msg.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar a mensagem.' });
  }
});

// GET /api/equipe/supervisao -> desempenho de cada membro (só supervisor).
// Cada membro tem o próprio funil isolado — aqui só lemos um resumo agregado,
// nunca os clientes/negociações em si.
router.get('/supervisao', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId || user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só supervisores podem ver essa página.' });
    }

    const membros = await User.find({ equipeId: user.equipeId });
    const resultado = [];
    for (const m of membros) {
      const [colunas, cards] = await Promise.all([
        Column.find({ userId: m._id }),
        Card.find({ userId: m._id }),
      ]);
      let ganhoValor = 0;
      let perdidoValor = 0;
      let abertoValor = 0;
      cards.forEach((c) => {
        const col = colunas.find((k) => k._id.toString() === c.columnId.toString());
        if (!col) return;
        if (col.tipo === 'ganho') ganhoValor += Number(c.valor) || 0;
        else if (col.tipo === 'perdido') perdidoValor += Number(c.valor) || 0;
        else if (col.tipo === 'aberto') abertoValor += Number(c.valor) || 0;
      });
      resultado.push({
        userId: m._id.toString(),
        nome: m.nome || m.email,
        papel: m.papelEquipe,
        totalLeads: cards.length,
        ganhoValor,
        perdidoValor,
        abertoValor,
      });
    }
    res.json({ membros: resultado });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a supervisão.' });
  }
});

// GET /api/equipe/supervisao/:userId/dashboard -> tudo que o Dashboard precisa
// (colunas, clientes, tarefas, meta individual) de um membro específico da equipe —
// só leitura, pro supervisor acompanhar sem poder alterar nada daquela pessoa.
router.get('/supervisao/:userId/dashboard', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const user = await User.findById(req.userId);
    if (!user.equipeId || user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só supervisores podem ver essa página.' });
    }
    const membro = await User.findOne({ _id: req.params.userId, equipeId: user.equipeId });
    if (!membro) return res.status(404).json({ error: 'Membro não encontrado nessa equipe.' });

    const mesAtual = new Date().toISOString().slice(0, 7);
    const [columns, cards, tasks, meta] = await Promise.all([
      Column.find({ userId: membro._id }),
      Card.find({ userId: membro._id, arquivado: { $ne: true } }),
      Task.find({ userId: membro._id }),
      MetaVendas.findOne({ userId: membro._id, mes: mesAtual }),
    ]);

    res.json({
      nome: membro.nome || membro.email,
      columns: columns.map((c) => c.toJSON()),
      cards: cards.map((c) => c.toJSON()),
      tasks: tasks.map((t) => t.toJSON()),
      metaVendasValor: meta ? meta.valorMeta : 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o dashboard desse membro.' });
  }
});

// GET /api/equipe/meta-vendas/:mes -> meta e total vendido pela equipe inteira naquele mês
router.get('/meta-vendas/:mes', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });

    const mes = req.params.mes;
    const [meta, membros] = await Promise.all([
      MetaVendasEquipe.findOne({ equipeId: user.equipeId, mes }),
      User.find({ equipeId: user.equipeId }),
    ]);

    let vendidoNoMes = 0;
    for (const m of membros) {
      const [colunas, cards] = await Promise.all([
        Column.find({ userId: m._id }),
        Card.find({ userId: m._id, mes }),
      ]);
      cards.forEach((c) => {
        const col = colunas.find((k) => k._id.toString() === c.columnId.toString());
        if (col && col.tipo === 'ganho') vendidoNoMes += Number(c.valor) || 0;
      });
    }

    res.json({
      mes,
      valorMeta: meta ? meta.valorMeta : 12000000,
      vendidoNoMes,
      souGestor: user.papelEquipe === 'supervisor',
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar a meta da equipe.' });
  }
});

// PUT /api/equipe/meta-vendas/:mes -> define/atualiza a meta da equipe naquele mês (só gestor)
router.put('/meta-vendas/:mes', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.equipeId) return res.status(400).json({ error: 'Você não faz parte de nenhuma equipe.' });
    if (user.papelEquipe !== 'supervisor') {
      return res.status(403).json({ error: 'Só o gestor da equipe pode alterar essa meta.' });
    }
    const { valorMeta } = req.body;
    if (typeof valorMeta !== 'number' || valorMeta < 0) {
      return res.status(400).json({ error: 'Informe um valor de meta válido.' });
    }
    const meta = await MetaVendasEquipe.findOneAndUpdate(
      { equipeId: user.equipeId, mes: req.params.mes },
      { valorMeta },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(meta.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a meta da equipe.' });
  }
});

module.exports = router;
