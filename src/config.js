require('dotenv').config();

const producao = process.env.NODE_ENV === 'production';

const config = {
  producao,
  porta: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://cardapio_app:app@127.0.0.1:5432/cardapio',
  jwtSecret: process.env.JWT_SECRET || '',
  // Endereço do site (links nos e-mails). No Render, RENDER_EXTERNAL_URL já vem preenchido.
  urlPublica: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  jwtValidade: '12h',
  // Contas de cliente: só para pagar a entrega pelo site. CLIENTE_CONTAS=off desliga contas e pagamento pelo site.
  clienteContas: !/^(off|0|false|nao|não)$/i.test(process.env.CLIENTE_CONTAS || ''),
  // Empresa que processa o pagamento pelo site. "demo" = tela de demonstração (não cobra nada). Vazio ou "off" = desligado.
  pagamentoProvedor: (process.env.PAGAMENTO_PROVEDOR === undefined ? 'demo' : process.env.PAGAMENTO_PROVEDOR).trim().toLowerCase().replace(/^off$/, ''),
  // Contato do suporte mostrado em "Esqueci minha senha" (opcional)
  suporteWhatsapp: (process.env.SUPORTE_WHATSAPP || '').replace(/\D/g, ''),
  whatsapp: {
    provedor: (process.env.WHATSAPP_PROVEDOR || '').trim().toLowerCase(), // '', 'log' ou 'meta'
    token: process.env.WHATSAPP_TOKEN || '', phoneId: process.env.WHATSAPP_PHONE_ID || '',
    modelo: process.env.WHATSAPP_MODELO || 'status_pedido', modeloCarrinho: process.env.WHATSAPP_MODELO_CARRINHO || 'lembrete_carrinho', idioma: process.env.WHATSAPP_IDIOMA || 'pt_BR', versao: process.env.WHATSAPP_API_VERSAO || 'v21.0'
  },
  // Restaurante da página inicial (/) do site
  siteRestaurante: (process.env.SITE_RESTAURANTE || 'sabor-da-casa').trim().toLowerCase(),
  suporteEmail: (process.env.SUPORTE_EMAIL || '').trim(),
  // Emissor de NFC-e: "demo" (simula, sem valor fiscal), "focusnfe" (emissão real) ou "off"
  fiscalProvedor: (process.env.FISCAL_PROVEDOR === undefined ? 'demo' : process.env.FISCAL_PROVEDOR).trim().toLowerCase().replace(/^off$/, ''),
  // Busca de endereço para a taxa por distância (OpenStreetMap/Nominatim). "off" desliga a busca (o cliente marca no mapa).
  buscaEndereco: !/^(off|0|false)$/i.test(process.env.BUSCA_ENDERECO || ''),
  buscaEnderecoContato: (process.env.BUSCA_ENDERECO_CONTATO || process.env.SUPORTE_EMAIL || '').trim(),
  // E-mail ("Esqueci minha senha" e faturas): "log" (padrão, só escreve no log), "resend", "smtp" ou "off"
  email: {
    // em produção, sem EMAIL_PROVEDOR, o envio fica desligado (o modo "log" escreveria links de senha no log)
    provedor: (process.env.EMAIL_PROVEDOR || (producao ? 'off' : 'log')).trim().toLowerCase(),
    remetente: (process.env.EMAIL_REMETENTE || 'Cardápio Digital <nao-responda@exemplo.com>').trim(),
    resendChave: process.env.RESEND_API_KEY || '',
    smtpHost: process.env.SMTP_HOST || '', smtpPorta: Number(process.env.SMTP_PORTA || 587), smtpUsuario: process.env.SMTP_USUARIO || '', smtpSenha: process.env.SMTP_SENHA || ''
  },
  // Quem opera a plataforma (aparece nos Termos de uso e no Aviso de privacidade)
  plataforma: {
    nome: (process.env.PLATAFORMA_NOME || 'Cardápio Digital').trim(),
    razao: (process.env.PLATAFORMA_RAZAO_SOCIAL || '').trim(),
    cnpj: (process.env.PLATAFORMA_CNPJ || '').replace(/\D/g, ''),
    cidade: (process.env.PLATAFORMA_CIDADE || '').trim(),
    privacidadeEmail: (process.env.PRIVACIDADE_EMAIL || process.env.SUPORTE_EMAIL || '').trim()
  },
  // Pix automático: o modo "demo" (pagamento simulado) fica disponível para apresentações. PIX_DEMO=off esconde.
  // Em produção começa DESLIGADO: ligue com PIX_DEMO=on só no site de demonstração (o botão "Simular pagamento" aprova pedidos sem dinheiro)
  pixDemo: producao ? /^(on|1|true|sim)$/i.test(process.env.PIX_DEMO || '') : !/^(off|0|false)$/i.test(process.env.PIX_DEMO || ''),
  // Mensalidade dos restaurantes: "demo" (simula o Pix) ou "mercadopago" (conta da plataforma)
  cobranca: {
    // em produção, sem COBRANCA_PROVEDOR, a fatura não tem Pix (só baixa manual pelos devs). "demo" precisa ser escolhido de propósito.
    provedor: (process.env.COBRANCA_PROVEDOR || (producao ? 'off' : 'demo')).trim().toLowerCase(),
    mpToken: process.env.COBRANCA_MP_TOKEN || '', mpSegredo: process.env.COBRANCA_MP_SEGREDO || '',
    email: (process.env.COBRANCA_EMAIL_PAGADOR || '').trim()
  },
  // Importar cardápio por foto (usa a API da Anthropic). Sem chave, só planilha e iFood.
  ia: {
    chave: process.env.ANTHROPIC_API_KEY || '',
    modelo: (process.env.ANTHROPIC_MODELO || 'claude-sonnet-5').trim(),
    url: (process.env.ANTHROPIC_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
  },
  // Domínio próprio: endereço para onde o CNAME do restaurante deve apontar (ex.: cardapio-serv.onrender.com)
  dominioAlvo: (process.env.DOMINIO_ALVO || '').trim().toLowerCase()
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
