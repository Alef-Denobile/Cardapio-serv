const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Haiku é rápido e barato — suficiente para sugestões curtas de texto e pro assistente de chat.
const MODELO = 'claude-haiku-4-5-20251001';

// Chamada de baixo nível — devolve a resposta inteira da API (não só o texto), porque
// o assistente com ferramentas precisa examinar o stop_reason e os blocos tool_use.
async function chamarClaude({ system, mensagens, maxTokens = 300, tools } = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('A integração com IA não está configurada neste servidor.');
  }
  const corpo = { model: MODELO, max_tokens: maxTokens, messages: mensagens };
  if (system) corpo.system = system;
  if (tools && tools.length) corpo.tools = tools;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(corpo),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || 'Erro ao consultar a IA.');
  }
  return data;
}

async function perguntarClaude(prompt, { maxTokens = 300, system, mensagens } = {}) {
  const data = await chamarClaude({
    system,
    mensagens: mensagens && mensagens.length ? mensagens : [{ role: 'user', content: prompt }],
    maxTokens,
  });
  const bloco = (data.content || []).find((b) => b.type === 'text');
  return bloco ? bloco.text.trim() : '';
}

module.exports = { perguntarClaude, chamarClaude };
