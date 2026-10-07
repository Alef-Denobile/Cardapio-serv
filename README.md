# Cardápio Digital — servidor

Sistema de pedidos para vários restaurantes ao mesmo tempo: pedidos na **mesa** (QR Code), **retirada** e **delivery**, com a cozinha e o entregador recebendo tudo em **tempo real**.

- **Site de cada restaurante:** `seusite.com.br/r/nome-do-restaurante`, com destaques em carrossel, categorias com foto, cardápio completo, avaliações, carrinho, entrega e retirada. A página inicial (`seusite.com.br/`) mostra o restaurante definido em `SITE_RESTAURANTE` (no exemplo, o **Sabor da Casa**).
- **Mesa:** o QR Code abre `seusite.com.br/r/nome-do-restaurante/mesa/5?t=código`, o cardápio daquela mesa.
- O cliente **não faz cadastro** para pedir na mesa, retirar ou pagar a entrega na porta. Só quem escolhe **pagar a entrega pelo site** entra com uma conta. Os pedidos ficam guardados no próprio aparelho, onde ele acompanha em tempo real e avalia depois da entrega.
- **Restaurante:** `seusite.com.br/painel`, com login. Cada pessoa vê só o que a função dela permite:
  - **Dono:** pedidos, produtos, histórico e financeiro, mapa das mesas, mesas e QR Codes, equipe e configurações.
  - **Cozinha:** pedidos e "esgotar" produtos.
  - **Entregador:** só as entregas.

## Como funciona por dentro

| Parte | Tecnologia | Para quê |
|---|---|---|
| Servidor | Node.js + Express | Recebe pedidos, aplica as regras, faz o login |
| Banco | PostgreSQL 15 ou mais novo | Guarda restaurantes, produtos, mesas, pedidos e equipe |
| Tempo real | Socket.io | Avisa cozinha, entregador e cliente na hora |
| Login | JWT + senha criptografada (bcrypt) | Protege a área do restaurante |

Segurança já incluída:

- Os preços são recalculados no servidor, então o cliente não consegue mandar um valor falso.
- Cada QR de mesa tem um código secreto, que pode ser trocado a qualquer momento.
- **Isolamento entre restaurantes em duas camadas:**
  1. O código filtra tudo pelo restaurante de quem está logado.
  2. O próprio PostgreSQL também barra, com o **Row Level Security**: cada operação do painel roda numa sessão "presa" ao restaurante, e o banco só devolve e só aceita linhas daquele restaurante. Mesmo uma consulta escrita sem filtro, por engano, não enxerga outro restaurante.
- **Regras garantidas pelo banco:**
  - preço nunca negativo;
  - o total do pedido sempre igual a subtotal + taxas;
  - item de pedido e entregador sempre do mesmo restaurante do pedido;
  - número do pedido único por restaurante.
- Login, pedidos e chamados de garçom têm limite de tentativas.
- Os cabeçalhos de segurança (Helmet) estão ativos.

## Rodar no seu computador (para testar)

1. Instale o **Node.js 20 ou mais novo** (nodejs.org).
2. Tenha um banco PostgreSQL. A forma mais simples é criar um gratuito no **neon.tech** e copiar o endereço de conexão. Também serve um PostgreSQL instalado no computador.
3. Nesta pasta, copie `.env.example` para `.env` e preencha `DATABASE_URL`.
4. No terminal, dentro da pasta:
   ```
   npm install
   npm run seed
   npm start
   ```
   O `seed` e o servidor criam e atualizam as tabelas sozinhos (pasta `src/db/migracoes`).
5. Abra no navegador:
   - Site do restaurante: http://localhost:3000/ (o mesmo que http://localhost:3000/r/sabor-da-casa)
   - Painel: http://localhost:3000/painel

O restaurante de exemplo é o **Sabor da Casa**: 20 pratos de categorias variadas (pizzas, hambúrgueres, mexicanos, sopas, sobremesas...), com fotos, opções e adicionais, 12 mesas e, com `npm run seed -- --com-historico`, 30 dias de pedidos e avaliações para mostrar os relatórios.

Logins do exemplo (senha `sabordacasa123`):
- `dono@sabordacasa.com`
- `cozinha@sabordacasa.com`
- `carlos@sabordacasa.com` e `rafa@sabordacasa.com` (entregadores)

**Troque essas senhas antes de usar com clientes reais.**

Para testar o tempo real, abra o cardápio no celular e o painel no computador, os dois apontando para o mesmo servidor.

## Colocar no ar

### 1. Código: GitHub

1. Crie uma conta em **github.com** e um repositório **privado** (por exemplo `cardapio-digital`).
2. Envie esta pasta para o repositório. O arquivo `.env` **não** vai junto, e é assim que deve ser.

### 2. De graça: banco no Neon e servidor no Render (`render.yaml`)

Bom para demonstração e para os primeiros testes. Custo zero, sem cartão no Neon.

**Banco (Neon, gratuito e sem prazo para acabar):**
1. Crie uma conta em **neon.com** e um projeto (região **US East**, perto do servidor). Ele já vem com o banco `neondb`.
2. Abra o **SQL Editor**, cole o arquivo `neon.sql` (troque a senha dentro dele) e clique em **Run**. Isso cria o usuário `cardapio_app`, que não é administrador do banco; assim o isolamento entre restaurantes vale de verdade.
3. Monte o endereço: no botão **Connect**, desligue a opção "Connection pooling" e copie o host (algo como `ep-xxxx.us-east-1.aws.neon.tech`). O endereço fica:
   `postgresql://cardapio_app:SUA-SENHA@SEU-HOST/neondb?sslmode=require`

**Servidor (Render, plano Free):**
1. Crie uma conta em **render.com** e conecte o GitHub.
2. **New > Blueprint**, escolha o repositório. O `render.yaml` cria o servidor no plano **Free** e pede quatro valores:
   - `DATABASE_URL`: o endereço do Neon acima;
   - `ADMIN_INICIAL_EMAIL` e `ADMIN_INICIAL_SENHA` (mínimo 10 caracteres): o seu acesso à área de devs;
   - `PUBLIC_URL`: deixe em branco por enquanto.
3. Aguarde o deploy. O build já cria as tabelas, os restaurantes de demonstração e o seu acesso de dev (o plano Free não tem Shell, por isso isso acontece no build; nos próximos deploys ele não mexe em nada).
4. Teste `https://SEU-SITE.onrender.com/api/saude`, depois coloque esse endereço em `PUBLIC_URL` (Environment).

**Limites do gratuito (confira no site de cada um, eles mudam):**
- **O servidor "dorme"** depois de 15 minutos sem acesso. O primeiro acesso depois disso demora cerca de 1 minuto para abrir. Na demonstração, abra o site uns 2 minutos antes de chegar ao restaurante.
- O servidor tem 750 horas grátis por mês, o suficiente para um servidor ligado o mês inteiro.
- O Neon guarda até 1 GB por projeto (dezenas de milhares de pedidos) e também "dorme" após 5 minutos; acorda em menos de um segundo.
- **Não use o gratuito com restaurante de verdade:** se o servidor estiver dormindo, o pedido do cliente demora para entrar e o painel da cozinha perde a conexão. No primeiro cliente pagante, passe o servidor para o plano **Starter** (Render → Settings → Instance Type). O banco pode continuar no Neon.

Os comandos que precisariam do Shell (`npm run novo-admin`, `npm run novo-restaurante`) podem ser rodados no seu computador, com o mesmo `DATABASE_URL` no arquivo `.env`. Restaurantes novos também podem ser criados direto em `/admin`.

### 2b. Pago: banco e servidor no Render (`render-pago.yaml`)

Quando tiverem clientes, use **New > Blueprint** com o caminho `render-pago.yaml`. Ele cria o banco PostgreSQL no Render e o servidor no plano Starter, sempre ligado, já conectados. Depois rode `npm run seed` e `npm run novo-admin` pelo Shell do Render. Confira os preços atuais no site do Render.

### 3. Domínio próprio (opcional)

Registre o domínio (por exemplo no Registro.br) e, no Render, em **Settings > Custom Domains**, siga as instruções. O HTTPS é automático.

## Cadastrar um novo restaurante

Restaurante não se cadastra sozinho: quem cadastra é a equipe de vocês, pela área de devs (`/admin` → **Novo restaurante**) ou pelo comando abaixo.

```
npm run novo-restaurante -- --nome "Pizzaria do Zé" --slug pizzaria-do-ze --email ze@email.com --senha "senhaForte123" --mesas 15
```

O dono entra no painel e faz o resto: cadastra produtos, ajusta horário, bairros e taxas, cria logins para a cozinha e os entregadores e imprime os QR Codes.

## Quem precisa de cadastro

| Situação | Cadastro | O que o cliente informa |
|---|---|---|
| Mesa (QR Code) | não | nome |
| Retirada no balcão | não | nome e WhatsApp |
| Entrega paga na porta (cartão, dinheiro ou Pix na chave) | não | nome, WhatsApp, endereço e **CPF** |
| Entrega paga no site (cartão ou Pix online) | **sim**, conta com e-mail e senha | conta com nome, WhatsApp e CPF, e o endereço |

**CPF contra trote:** o servidor confere os dígitos do CPF (número possível ou não). Isso desencoraja o pedido falso, mas não prova que o CPF é da pessoa. No painel, o restaurante vê o CPF parcial (`***.982.247-**`). O número completo fica no banco e aparece só na área de devs, para um eventual boletim de ocorrência. O CPF não fica salvo no aparelho do cliente. Outras proteções para o futuro estão em `IDEIAS-ANTITROTE.md`.

**Pagamento pelo site:** o pedido fica "aguardando pagamento" e só chega à cozinha depois de aprovado. Se não for pago em 30 minutos, é cancelado sozinho, sem cobrar nada. Hoje o pagamento funciona em **modo de demonstração** (`PAGAMENTO_PROVEDOR=demo`): uma tela com os botões "Simular pagamento aprovado" e "recusado", que não pede cartão. Quando escolherem a empresa (Mercado Pago, PagBank, Asaas...), ela entra em `src/lib/pagamentos.js`. O número do cartão nunca passa pelo nosso servidor: o cliente digita na página segura da empresa. O pagamento pelo site aparece no site do restaurante (entrega); o cardápio da mesa (QR Code) não usa. Para desligar em um restaurante: `/admin` → Funções → "Pagamento pelo site". Para desligar em todos: `PAGAMENTO_PROVEDOR=off`.

## Cliente sem cadastro

- **Mesa:** o QR Code abre `/r/restaurante/mesa/5?t=código` direto no cardápio daquela mesa. Sem login.
- **Site do restaurante:** o cliente informa nome e WhatsApp (e CPF, se for entrega paga na porta) na hora de pedir. O aparelho lembra nome e WhatsApp para o próximo pedido.
- **Acompanhar:** cada pedido gera um código secreto que fica salvo no aparelho. É ele que libera o acompanhamento em tempo real e a avaliação, uma vez só, depois da entrega.
- **Favoritos:** ficam salvos no próprio aparelho.
- Se trocar de celular ou limpar o navegador, os pedidos antigos somem da lista (o restaurante continua vendo tudo no painel).

**Contas de cliente:** existem só para o pagamento pelo site (uma conta por CPF). Para desligar contas e pagamento pelo site de uma vez, defina `CLIENTE_CONTAS=off`.

**Esqueci a senha (cliente):** a tela mostra o contato do suporte (`SUPORTE_WHATSAPP`/`SUPORTE_EMAIL`) e lembra que dá para pagar na entrega sem conta. Envio de link por e-mail fica para depois.

## Impressora térmica na cozinha

Funciona com qualquer impressora térmica instalada no computador da cozinha (Elgin, Bematech, Epson, Daruma...), em papel de 80 ou 58 mm. Não precisa de programa extra.

1. Instale a impressora no Windows com o driver do fabricante e deixe-a como **impressora padrão**.
2. No painel, aba **Pedidos → Impressora**: escolha a largura do papel, imprima o cupom de teste e ligue **"Imprimir sozinho cada pedido novo neste computador"**.
3. Para o cupom sair direto, sem a janela de impressão, crie um atalho do Chrome só para o painel. Clique com o botão direito na área de trabalho → Novo → Atalho, e cole:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://SEU-ENDERECO/painel`
   Abra o painel sempre por esse atalho. Na janela de impressão do Chrome, ajuste uma vez: margens "Nenhuma" e escala 100%.

Cada pedido tem também o botão **Imprimir**, para reimprimir. A escolha da impressora fica salva só naquele computador.

## Avisos no WhatsApp

Há dois jeitos, e eles funcionam juntos:

- **Botão "WhatsApp do cliente" (grátis, já funciona):** em cada pedido do painel, abre o WhatsApp com a mensagem pronta para a etapa ("saiu para entrega", "pronto para retirar"...). Quem envia é o celular ou o computador do restaurante.
- **Aviso automático (API oficial do WhatsApp, pago por mensagem):** o cliente recebe sozinho "pedido recebido", "pronto para retirar", "saiu para entrega" e "cancelado". Cada mensagem custa por volta de R$ 0,04 (tabela da Meta para o Brasil, categoria utilidade); dá umas R$ 0,08 a 0,12 por pedido. Vem desligado. Os devs ligam por restaurante em `/admin` → Funções → "Avisos automáticos no WhatsApp" (bom candidato para um plano mais caro).

Para ligar o aviso automático:
1. Crie uma conta no **Meta Business** e ative a **WhatsApp Cloud API** com um número só para a plataforma (não pode ser um número que já usa o WhatsApp no celular).
2. Crie um modelo de mensagem da categoria **Utilidade**, idioma Português (BR), chamado `status_pedido`, com o texto:
   `Olá, {{1}}! Pedido #{{2}} no {{3}}: {{4}}.`
   e espere a Meta aprovar (costuma levar minutos ou horas).
3. No Render, em Environment: `WHATSAPP_PROVEDOR=meta`, `WHATSAPP_TOKEN` (token permanente do usuário do sistema) e `WHATSAPP_PHONE_ID` (o "Phone number ID" do número).
4. Para testar sem enviar nada de verdade: `WHATSAPP_PROVEDOR=log` escreve as mensagens só no log do servidor.

Se o envio falhar, o pedido segue normalmente; o erro fica no log.

## Exportar para Excel

No painel do dono, **Histórico e financeiro → Exportar para Excel** baixa um `.xlsx` do período escolhido (hoje, 7 dias, 30 dias ou tudo) com quatro abas:
- **Resumo:** faturamento, pedidos, ticket médio, por canal, por forma de pagamento e composição. São fórmulas sobre a aba Pedidos, para o contador conferir.
- **Pedidos:** um por linha, com data, canal, cliente, status, pagamento e valores.
- **Itens:** cada item vendido, com opções, quantidade e preço.
- **Mais vendidos.**

Pedidos cancelados aparecem na lista, mas não entram nos totais.

## Maquininhas de cartão (próximo passo)

Hoje o entregador leva a maquininha e o painel mostra quanto cobrar. Para o valor ir sozinho para a maquininha e o pedido ficar "pago" automaticamente, o caminho mais simples para um sistema na internet como este é o **Mercado Pago Point** (Point Smart e Point Pro): o servidor cria a cobrança pela API, a maquininha mostra o valor, e o Mercado Pago avisa o servidor quando o pagamento é aprovado. Não precisa instalar nada no computador do restaurante. A mesma conta do Mercado Pago serve também para o pagamento pelo site.

Stone, Cielo, PagBank e Rede integram por **TEF**, que exige um programa instalado no computador do caixa, ou por um aplicativo próprio rodando dentro da maquininha (Smart POS), com homologação de cada empresa. São mais trabalhosos para começar.

## Esqueci minha senha

Não há e-mail automático: quem cadastrou a pessoa define uma senha nova.
- **Cozinha e entregador:** o dono vai em **Equipe → Nova senha** e passa a senha nova para a pessoa.
- **Dono:** fala com vocês, e um dev define a senha nova em `/admin` (restaurante → Equipe).
- **Dev:** `npm run novo-admin -- --email voce@email.com --senha "novaSenhaForte" --trocar-senha` no Shell do Render.
- Qualquer pessoa logada pode trocar a própria senha em **Trocar senha**, no topo do painel.
- Para mostrar o contato do suporte na tela "Esqueci minha senha", defina `SUPORTE_WHATSAPP` (só números, com 55 e DDD) e/ou `SUPORTE_EMAIL`.

## Estrutura do banco

| Tabela | O que guarda |
|---|---|
| `restaurantes` | dados, regras, horário, funções liberadas pelos devs |
| `bairros` | bairros atendidos e taxa de entrega |
| `usuarios` | donos, cozinha e entregadores (cada um de um restaurante) |
| `produtos` | cardápio, com opções e adicionais |
| `mesas` | número e código secreto do QR |
| `pedidos`, `pedido_itens`, `pedido_historico` | pedidos, itens e cada mudança de etapa |
| `chamados` | "chamar garçom" e "pedir a conta" |
| `admins`, `auditoria` | contas de dev e histórico do que elas alteraram |
| `clientes`, `favoritos`, `avaliacoes` | contas de cliente (desligadas por padrão), favoritos dessas contas e notas dos pedidos |

Para mudar a estrutura no futuro, crie um arquivo novo em `src/db/migracoes/` (por exemplo `002_estoque.sql`). O servidor aplica sozinho na próxima vez que iniciar, uma vez só. Para aplicar na mão, use `npm run migrar`.

## Endereços da API

Site do restaurante:
- `GET /api/site`: qual restaurante a página inicial mostra.
- `GET /api/r/:slug`: dados do restaurante, cardápio e avaliações.
- `POST /api/acompanhar` com `{ pedidos: [{ id, c }] }`: status dos pedidos guardados no aparelho.
- `POST /api/acompanhar/:id/avaliacao` com `{ c, nota, comentario }`: avaliação depois da entrega.
- `GET /api/pagamentos/config` e, no modo demo, `POST /api/pagamentos/demo/:id` com `{ c, resultado: "aprovar" | "recusar" }`.
- Contas (para pagar no site): `POST /api/clientes/cadastro` (nome, e-mail, senha, telefone, CPF) e `POST /api/clientes/login`, e com login de cliente:
  - `GET /api/clientes/eu` e `PATCH /api/clientes/eu`;
  - `PUT /api/clientes/favoritos/:slug` e `DELETE /api/clientes/favoritos/:slug`;
  - `GET /api/clientes/pedidos`;
  - `POST /api/clientes/pedidos/:id/avaliacao`.

Abertos ao público:
- `GET /api/r/:slug`: cardápio.
- `POST /api/r/:slug/pedidos`: novo pedido.
- `GET /api/acompanhar/:id?c=código`: status do pedido.
- `POST /api/r/:slug/chamados`: chamar o garçom.

Exigem login:
- `/api/auth/login`, `/api/auth/eu` e `POST /api/auth/senha` (trocar a própria senha)
- `/api/painel/pedidos`
- `/api/painel/produtos`
- `/api/painel/mesas`
- `/api/painel/equipe` e `POST /api/painel/equipe/:id/senha` (dono define senha nova)
- `/api/painel/restaurante`

## Próximas etapas

- Custo real de cada produto (ficha técnica), para o balanço usar o custo exato em vez de uma porcentagem.
- Exportar o histórico para planilha.
- Pagamento por Pix e cartão integrado (Mercado Pago ou PagSeguro), com confirmação automática.
- Envio de fotos dos produtos (hoje entra um link de imagem).
- Verificação em duas etapas (código no celular) para as contas de dev.
- Integrar a maquininha Mercado Pago Point (cobrança automática na entrega e no balcão).
- Ligar uma empresa de pagamento real (cartão e Pix online), com webhook de confirmação e estorno quando o dono cancela um pedido já pago.
- "Esqueci minha senha" por e-mail para as contas de cliente.
- Endereços salvos na conta de cliente.
- Mais proteções anti-trote: ver `IDEIAS-ANTITROTE.md`.
- Aviso do status do pedido pelo WhatsApp do cliente.
