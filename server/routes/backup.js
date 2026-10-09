const express = require('express');
const auth = require('../middleware/auth');

const User = require('../models/User');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Funil = require('../models/Funil');
const Task = require('../models/Task');
const Contrato = require('../models/Contrato');
const Message = require('../models/Message');
const Automacao = require('../models/Automacao');
const Fluxo = require('../models/Fluxo');
const FluxoExecucao = require('../models/FluxoExecucao');
const CampoPersonalizado = require('../models/CampoPersonalizado');
const MensagemAgendada = require('../models/MensagemAgendada');
const MetaVendas = require('../models/MetaVendas');
const PossivelLead = require('../models/PossivelLead');
const Anexo = require('../models/Anexo');

const router = express.Router();
router.use(auth);

// GET /api/backup/exportar-tudo -> baixa um arquivo com todos os dados do usuário logado
// (clientes, tarefas, comissões, mensagens, automações, etc.), pra guardar como cópia de segurança.
router.get('/exportar-tudo', async (req, res) => {
  try {
    const userId = req.userId;
    const [
      usuario, cards, columns, funis, tasks, contratos, messages,
      automacoes, fluxos, fluxoExecucoes, camposPersonalizados,
      mensagensAgendadas, metasVendas, possiveisLeads, anexos,
    ] = await Promise.all([
      User.findById(userId).select('-senhaHash -whatsappBusiness.accessToken -googleCalendar.accessToken -googleCalendar.refreshToken -twoFactorSecret'),
      Card.find({ userId }),
      Column.find({ userId }),
      Funil.find({ userId }),
      Task.find({ userId }),
      Contrato.find({ userId }),
      Message.find({ userId }),
      Automacao.find({ userId }),
      Fluxo.find({ userId }),
      FluxoExecucao.find({ userId }),
      CampoPersonalizado.find({ userId }),
      MensagemAgendada.find({ userId }),
      MetaVendas.find({ userId }),
      PossivelLead.find({ userId }),
      Anexo.find({ userId }),
    ]);

    const backup = {
      geradoEm: new Date().toISOString(),
      versao: 1,
      usuario: usuario ? usuario.toJSON() : null,
      clientes: cards.map((d) => d.toJSON()),
      colunas: columns.map((d) => d.toJSON()),
      funis: funis.map((d) => d.toJSON()),
      tarefas: tasks.map((d) => d.toJSON()),
      comissoes: contratos.map((d) => d.toJSON()),
      mensagensWhatsapp: messages.map((d) => d.toJSON()),
      automacoes: automacoes.map((d) => d.toJSON()),
      fluxos: fluxos.map((d) => d.toJSON()),
      execucoesDeFluxo: fluxoExecucoes.map((d) => d.toJSON()),
      camposPersonalizados: camposPersonalizados.map((d) => d.toJSON()),
      mensagensAgendadas: mensagensAgendadas.map((d) => d.toJSON()),
      metasDeVendas: metasVendas.map((d) => d.toJSON()),
      possiveisLeads: possiveisLeads.map((d) => d.toJSON()),
      anexos: anexos.map((d) => d.toJSON()),
    };

    const nomeArquivo = `backup-painel-crm-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ error: 'Erro ao gerar o backup. Tente novamente.' });
  }
});

// Restaura uma lista de documentos (do jeito que saem do backup, com "id" em vez de
// "_id") de volta no banco — usa o MESMO _id de antes, então os vínculos entre
// coleções (tarefa -> cliente, mensagem -> cliente, etc.) continuam funcionando.
// Sempre força o dado a pertencer ao usuário que está importando, nunca ao que
// estava gravado no arquivo — evita qualquer chance de um backup "vestir" outra conta.
async function restaurarColecao(Model, itens, userId) {
  let ok = 0;
  let erro = 0;
  for (const item of itens || []) {
    try {
      const { id, ...dados } = item;
      if (!id) { erro++; continue; }
      delete dados.userId;
      dados.userId = userId;
      await Model.findOneAndUpdate(
        { _id: id },
        { $set: dados },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      ok++;
    } catch (e) {
      erro++;
    }
  }
  return { ok, erro };
}

// POST /api/backup/importar-tudo -> restaura um backup gerado por /exportar-tudo.
// Não apaga nada que já existe — atualiza o que já tinha o mesmo id, e cria o que
// for novo (upsert). Sempre associado à conta de quem está fazendo a importação.
router.post('/importar-tudo', async (req, res) => {
  try {
    const backup = req.body;
    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Arquivo de backup inválido.' });
    }
    const userId = req.userId;

    const mapaColecoes = [
      ['colunas', Column],
      ['funis', Funil],
      ['clientes', Card],
      ['tarefas', Task],
      ['comissoes', Contrato],
      ['mensagensWhatsapp', Message],
      ['automacoes', Automacao],
      ['fluxos', Fluxo],
      ['execucoesDeFluxo', FluxoExecucao],
      ['camposPersonalizados', CampoPersonalizado],
      ['mensagensAgendadas', MensagemAgendada],
      ['metasDeVendas', MetaVendas],
      ['possiveisLeads', PossivelLead],
      ['anexos', Anexo],
    ];

    const resultado = {};
    for (const [chave, Model] of mapaColecoes) {
      resultado[chave] = await restaurarColecao(Model, backup[chave], userId);
    }

    res.json({ resultado });
  } catch (err) {
    console.error('Erro ao importar backup:', err);
    res.status(500).json({ error: 'Erro ao importar o backup. Confira se o arquivo é o correto.' });
  }
});

module.exports = router;
