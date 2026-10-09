// Termos de uso e Aviso de privacidade (LGPD — Lei 13.709/2018).
// As páginas são montadas aqui para sempre mostrar os dados atuais da plataforma (variáveis PLATAFORMA_*)
// e, quando abertas a partir de um restaurante (?r=slug), o nome e o contato desse restaurante.
// IMPORTANTE: é um modelo. Antes de vender, peça para um advogado revisar e completar.
const express = require('express');
const config = require('../config');
const { sistema } = require('../db');
const { rota } = require('../lib/util');

const r = express.Router();
const ATUALIZADO = '9 de outubro de 2026';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCnpj = d => String(d || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

async function restDaPagina(req) {
  const slug = String(req.query.r || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return null;
  return sistema(async c => (await c.query('SELECT nome, slug, whatsapp, fiscal FROM restaurantes WHERE slug = $1', [slug])).rows[0] || null);
}
// "Cardápio Digital (Empresa Ltda, CNPJ ..., com sede em ...)": os parênteses só aparecem se houver dados
function plataformaTxt() {
  const p = config.plataforma;
  const det = [p.razao ? esc(p.razao) : '', p.cnpj ? 'CNPJ ' + esc(fmtCnpj(p.cnpj)) : '', p.cidade ? 'com sede em ' + esc(p.cidade) : ''].filter(Boolean).join(', ');
  return esc(p.nome) + (det ? ' (' + det + ')' : '');
}
function contatoPrivacidade() {
  const e = config.plataforma.privacidadeEmail;
  return e ? '<a href="mailto:' + esc(e) + '">' + esc(e) + '</a>' : 'o canal de suporte informado pelo restaurante';
}
function pagina(titulo, rest, corpo) {
  const volta = rest ? '/r/' + encodeURIComponent(rest.slug) : '/';
  const outra = titulo.startsWith('Termos') ? ['/privacidade', 'Aviso de privacidade'] : ['/termos', 'Termos de uso'];
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + '</title>' +
    '<style>:root{--cor:#E30613;--fundo:#FBF7F6;--papel:#fff;--tinta:#1D2142;--suave:#5E6278;--linha:#ECE6E6}' +
    '@media (prefers-color-scheme:dark){:root{--fundo:#131116;--papel:#1D1A21;--tinta:#F2EEF3;--suave:#A8A3B0;--linha:#2E2A33}}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--tinta);font:16px/1.6 Nunito,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'header{background:var(--cor);color:#fff;padding:14px 16px}header a{color:#fff;font-weight:800;text-decoration:none}' +
    'main{max-width:780px;margin:0 auto;padding:22px 16px 60px}article{background:var(--papel);border:1px solid var(--linha);border-radius:16px;padding:22px 22px 10px}' +
    'h1{font-size:28px;line-height:1.2;margin:0 0 4px}h2{font-size:19px;margin:26px 0 6px}p,li{color:var(--tinta)}small,.sub{color:var(--suave)}' +
    'a{color:var(--cor)}ul{padding-left:20px}li{margin:4px 0}.resumo{background:color-mix(in srgb,var(--cor) 8%,var(--papel));border-radius:12px;padding:12px 16px;margin:16px 0}' +
    'table{width:100%;border-collapse:collapse;font-size:14.5px}td,th{border-top:1px solid var(--linha);padding:8px 6px;text-align:left;vertical-align:top}th{font-size:13px;color:var(--suave)}' +
    'nav{display:flex;gap:16px;flex-wrap:wrap;margin-top:18px;font-weight:700}</style></head><body>' +
    '<header><a href="' + esc(volta) + '">‹ Voltar' + (rest ? ' ao ' + esc(rest.nome) : '') + '</a></header><main><article>' +
    '<h1>' + esc(titulo) + '</h1><p class="sub">Atualizado em ' + ATUALIZADO + '</p>' + corpo + '</article>' +
    '<nav><a href="' + outra[0] + (rest ? '?r=' + encodeURIComponent(rest.slug) : '') + '">' + outra[1] + '</a><a href="' + esc(volta) + '">Voltar</a></nav></main></body></html>';
}

r.get('/privacidade', rota(async (req, res) => {
  const rest = await restDaPagina(req), nomeR = rest ? esc(rest.nome) : 'o restaurante em que você pede';
  const contatoR = rest && rest.whatsapp ? ' (WhatsApp ' + esc(rest.whatsapp) + ')' : '';
  const corpo =
    '<div class="resumo"><strong>Em poucas palavras:</strong> usamos os seus dados só para fazer o seu pedido chegar, cobrar, emitir nota fiscal e evitar fraudes. Não vendemos seus dados e não mostramos propaganda. Você pode pedir para ver, corrigir ou apagar seus dados a qualquer momento.</div>' +
    '<h2>1. Quem cuida dos seus dados</h2>' +
    '<p>Quando você faz um pedido, <strong>' + nomeR + '</strong>' + contatoR + ' é o <strong>controlador</strong> dos seus dados: é ele quem decide como usá-los para atender o seu pedido.</p>' +
    '<p>A plataforma ' + plataformaTxt() + ' é a <strong>operadora</strong>: fornece o sistema ao restaurante e trata os dados em nome dele, seguindo as instruções dele e esta política. Para as contas de cliente, as contas da equipe dos restaurantes e os contratos com os restaurantes, a plataforma é controladora.</p>' +
    '<h2>2. Quais dados usamos e para quê</h2>' +
    '<table><tr><th>Dado</th><th>Para quê</th><th>Base legal (LGPD, art. 7º)</th></tr>' +
    '<tr><td>Nome</td><td>Identificar o seu pedido e chamar você quando ficar pronto</td><td>Execução do contrato (o seu pedido)</td></tr>' +
    '<tr><td>WhatsApp</td><td>Falar com você sobre o pedido e enviar os avisos de andamento</td><td>Execução do contrato</td></tr>' +
    '<tr><td>Endereço e localização no mapa</td><td>Entregar o pedido e calcular a taxa de entrega</td><td>Execução do contrato</td></tr>' +
    '<tr><td>CPF</td><td>Na entrega paga na porta, evitar pedidos falsos (trote). Na nota fiscal, só se você pedir</td><td>Legítimo interesse (prevenção de fraude) e cumprimento de obrigação legal</td></tr>' +
    '<tr><td>E-mail e senha (só se criar conta)</td><td>Entrar na conta, pagar pelo site e criar uma senha nova se esquecer. A senha é guardada de forma cifrada, ninguém consegue ver</td><td>Execução do contrato</td></tr>' +
    '<tr><td>Pedido (itens, valores, forma de pagamento, horário)</td><td>Preparar, entregar, cobrar, emitir nota fiscal e manter o histórico de vendas do restaurante</td><td>Execução do contrato e obrigação legal (fiscal)</td></tr>' +
    '<tr><td>Avaliação que você escrever</td><td>Mostrar a opinião dos clientes no cardápio do restaurante (só com o primeiro nome e a inicial do sobrenome)</td><td>Consentimento (você escolhe avaliar)</td></tr>' +
    '<tr><td>Carrinho não finalizado (só se você marcar a opção)</td><td>Enviar um único lembrete no WhatsApp para você terminar o pedido</td><td>Consentimento (você marca e pode desmarcar)</td></tr>' +
    '<tr><td>Dados técnicos (endereço IP, data e hora de acesso)</td><td>Segurança, evitar abusos e cumprir o Marco Civil da Internet</td><td>Obrigação legal e legítimo interesse</td></tr></table>' +
    '<p>Não usamos os seus dados para propaganda, não vendemos e não fazemos perfil de consumo para terceiros.</p>' +
    '<h2>3. O que fica no seu aparelho</h2><p>O carrinho, os seus últimos pedidos e o acesso à sua conta ficam guardados no próprio navegador (armazenamento local), para você não perder o pedido se fechar a página. Não usamos cookies de propaganda nem de rastreamento. Você apaga tudo limpando os dados do site no navegador.</p>' +
    '<h2>4. Com quem os dados são compartilhados</h2><p>Só com quem é necessário para o serviço funcionar, sempre com contrato e medidas de segurança:</p><ul>' +
    '<li><strong>O restaurante</strong> em que você pediu (e o entregador dele, que vê nome, telefone e endereço da entrega).</li>' +
    '<li><strong>Hospedagem e banco de dados</strong> (Render e Neon), onde o sistema funciona.</li>' +
    '<li><strong>Empresa de pagamento</strong> (Mercado Pago), quando você paga por Pix automático ou pelo site. O número do cartão nunca passa pelo nosso sistema.</li>' +
    '<li><strong>WhatsApp (Meta)</strong>, para os avisos do pedido, quando o restaurante usa essa função.</li>' +
    '<li><strong>Envio de e-mail</strong> (Resend ou o provedor do restaurante), só para o link de senha nova.</li>' +
    '<li><strong>Emissor de nota fiscal</strong> (Focus NFe) e a Secretaria da Fazenda, quando o restaurante emite NFC-e.</li>' +
    '<li><strong>OpenStreetMap</strong>, que recebe o endereço digitado (sem nome nem telefone) para achar o local no mapa.</li>' +
    '<li><strong>Autoridades</strong>, quando a lei ou uma ordem judicial exigir.</li></ul>' +
    '<p>Alguns desses serviços guardam dados fora do Brasil (por exemplo, nos Estados Unidos). Nesses casos a transferência segue o art. 33 da LGPD, com cláusulas contratuais e garantias de proteção equivalentes.</p>' +
    '<h2>5. Por quanto tempo guardamos</h2><ul>' +
    '<li><strong>Pedidos:</strong> pelo prazo da legislação fiscal e de defesa do consumidor (em geral 5 anos), porque fazem parte das vendas do restaurante.</li>' +
    '<li><strong>Carrinho não finalizado:</strong> apagado em até 7 dias.</li>' +
    '<li><strong>Link de senha nova:</strong> vale 1 hora e funciona uma vez.</li>' +
    '<li><strong>Conta de cliente:</strong> até você pedir a exclusão (os pedidos antigos ficam, sem ligação com a conta).</li>' +
    '<li><strong>Registros de acesso:</strong> 6 meses, como pede o Marco Civil da Internet.</li></ul>' +
    '<h2>6. Seus direitos</h2><p>Pela LGPD (art. 18) você pode, a qualquer momento e sem custo: confirmar se tratamos seus dados; ver os dados; corrigir dados errados ou desatualizados; pedir que dados desnecessários sejam anonimizados, bloqueados ou apagados; levar seus dados para outro serviço (portabilidade); saber com quem foram compartilhados; e retirar o consentimento quando ele for a base legal.</p>' +
    '<p>Quem tem conta pode baixar os próprios dados e apagar a conta em <strong>Minha conta</strong>, no site do restaurante. Para os outros pedidos, fale com ' + nomeR + ' ou com a plataforma em ' + contatoPrivacidade() + '. Respondemos em até 15 dias. Você também pode reclamar na Autoridade Nacional de Proteção de Dados (ANPD).</p>' +
    '<h2>7. Segurança</h2><p>O site usa conexão cifrada (HTTPS); as senhas são guardadas cifradas; cada restaurante só enxerga os próprios dados, com isolamento no banco; o acesso da equipe é por e-mail e senha individuais; e os links de senha nova expiram. Se acontecer um incidente que possa trazer risco a você, avisamos você e a ANPD, como manda a lei.</p>' +
    '<h2>8. Crianças e adolescentes</h2><p>O serviço é para pedidos de comida e não é direcionado a menores de 18 anos. Se um menor fizer um pedido, os dados são usados só para atender esse pedido.</p>' +
    '<h2>9. Mudanças neste aviso</h2><p>Se este aviso mudar de forma importante, mostramos a data nova no topo e, para quem tem conta, um aviso no site.</p>' +
    '<h2>10. Encarregado de dados (DPO)</h2><p>Contato da plataforma para assuntos de privacidade: ' + contatoPrivacidade() + '.</p>';
  res.set('Cache-Control', 'no-cache').send(pagina('Aviso de privacidade', rest, corpo));
}));

r.get('/termos', rota(async (req, res) => {
  const rest = await restDaPagina(req), nomeR = rest ? esc(rest.nome) : 'o restaurante';
  const q = rest ? '?r=' + encodeURIComponent(rest.slug) : '';
  const corpo =
    '<div class="resumo"><strong>Em poucas palavras:</strong> o cardápio digital é uma ferramenta que ' + nomeR + ' usa para receber pedidos. Quem vende, prepara e entrega a comida é o restaurante. A plataforma fornece o sistema.</div>' +
    '<h2>1. Quem somos</h2><p>Este cardápio funciona na plataforma ' + plataformaTxt() + '. Ao usar o site, a mesa, o totem ou o painel, você concorda com estes termos e com o <a href="/privacidade' + q + '">Aviso de privacidade</a>.</p>' +
    '<h2>2. Para quem pede</h2><ul>' +
    '<li><strong>Quem vende é o restaurante.</strong> Preços, fotos, descrições, disponibilidade, tempo de preparo e de entrega, troca, cancelamento e qualidade dos produtos são responsabilidade de ' + nomeR + '. O Código de Defesa do Consumidor vale normalmente.</li>' +
    '<li><strong>Preço e taxas:</strong> o valor total, com taxa de entrega e taxa de serviço, aparece antes de você finalizar. Fotos são ilustrativas.</li>' +
    '<li><strong>Pagamento:</strong> Pix, cartão ou dinheiro, conforme o restaurante aceitar. No Pix automático e no pagamento pelo site, o pedido só vai para a cozinha depois que o pagamento é aprovado; se não for pago no prazo mostrado, ele é cancelado sozinho.</li>' +
    '<li><strong>Cancelamento:</strong> depois que o restaurante começa a preparar, o cancelamento depende dele. Fale direto com o restaurante.</li>' +
    '<li><strong>Dados corretos:</strong> informe nome, telefone e endereço verdadeiros. Pedidos falsos (trote) podem ser recusados e o CPF pode ser pedido na entrega paga na porta.</li>' +
    '<li><strong>Conta:</strong> você cuida da sua senha. Se esquecer, use "Esqueci minha senha". Você pode apagar a conta quando quiser em Minha conta.</li></ul>' +
    '<h2>3. Para os restaurantes</h2><ul>' +
    '<li>O restaurante é responsável pelo cardápio que publica (preços, alergênicos, informações obrigatórias), pelo atendimento, pela nota fiscal e pelas licenças do negócio.</li>' +
    '<li>O restaurante é o controlador dos dados dos seus clientes e deve usá-los só para atender os pedidos, conforme a LGPD. A plataforma trata esses dados como operadora, em nome do restaurante.</li>' +
    '<li>Cada pessoa da equipe tem o próprio acesso. O dono responde pelos acessos que cria e deve removê-los quando alguém sair.</li>' +
    '<li>A mensalidade vence no dia combinado. Depois do prazo de tolerância, o acesso pode ser suspenso automaticamente até o pagamento, sem apagar nenhum dado. O acesso volta assim que a fatura é paga.</li>' +
    '<li>Contas de serviços de terceiros (Mercado Pago, WhatsApp, emissor de nota) são do restaurante, que responde pelo uso e pelas tarifas delas.</li></ul>' +
    '<h2>4. Uso correto</h2><p>Não é permitido tentar invadir o sistema, fazer pedidos falsos, copiar o conteúdo do cardápio para outros fins, nem usar o serviço para algo ilegal. Podemos bloquear quem fizer isso.</p>' +
    '<h2>5. Disponibilidade</h2><p>Trabalhamos para o sistema ficar sempre no ar, mas podem acontecer falhas de internet, de hospedagem ou de serviços de terceiros. Nesses casos, o restaurante continua podendo atender pelo telefone ou no balcão.</p>' +
    '<h2>6. Responsabilidade</h2><p>A plataforma responde pelo funcionamento do sistema. Não responde pelos produtos vendidos, pelo atendimento do restaurante nem por informações que ele publicar. Nada aqui tira direitos garantidos pelo Código de Defesa do Consumidor.</p>' +
    '<h2>7. Mudanças</h2><p>Estes termos podem mudar. A versão em vigor é sempre a desta página, com a data no topo.</p>' +
    '<h2>8. Lei e foro</h2><p>Valem as leis brasileiras. Para o consumidor, o foro é o do seu domicílio.</p>' +
    '<h2>9. Contato</h2><p>Sobre o pedido: fale com ' + nomeR + (rest && rest.whatsapp ? ' pelo WhatsApp ' + esc(rest.whatsapp) : '') + '. Sobre a plataforma ou privacidade: ' + contatoPrivacidade() + '.</p>';
  res.set('Cache-Control', 'no-cache').send(pagina('Termos de uso', rest, corpo));
}));

module.exports = r;
