require('dotenv').config();

const producao = process.env.NODE_ENV === 'production';

const config = {
  producao,
  porta: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://cardapio_app:app@127.0.0.1:5432/cardapio',
  jwtSecret: process.env.JWT_SECRET || '',
  urlPublica: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  jwtValidade: '12h',
  // Contas de cliente no ChefOnline: desligadas. O cliente pede sem cadastro. Ligue com CLIENTE_CONTAS=on se um dia quiser conta opcional.
  clienteContas: !/^(off|0|false|nao|não)$/i.test(process.env.CLIENTE_CONTAS || ''),
  // Empresa que processa o pagamento pelo site. "demo" = tela de demonstração (não cobra nada). Vazio ou "off" = desligado.
  pagamentoProvedor: (process.env.PAGAMENTO_PROVEDOR === undefined ? 'demo' : process.env.PAGAMENTO_PROVEDOR).trim().toLowerCase().replace(/^off$/, ''),
  // Contato do suporte mostrado em "Esqueci minha senha" (opcional)
  suporteWhatsapp: (process.env.SUPORTE_WHATSAPP || '').replace(/\D/g, ''),
  suporteEmail: (process.env.SUPORTE_EMAIL || '').trim()
};

if (!config.jwtSecret) {
  if (producao) {
    console.error('ERRO: defina a variável JWT_SECRET (uma frase longa e aleatória) antes de iniciar em produção.');
    process.exit(1);
  }
  config.jwtSecret = 'apenas-para-desenvolvimento-local-troque-isto';
  console.warn('Aviso: JWT_SECRET não definido. Usando um valor de desenvolvimento.');
}

module.exports = config;
