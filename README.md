# Painel do Consórcio — CRM com MongoDB e login

⚠️ **Testes automatizados:** rode `cd server && npm test` pra rodar os testes
(usa o test runner nativo do Node, não precisa instalar nada a mais). Hoje cobre
o cálculo de comissão (as 4 modalidades) e a normalização de telefone — os dois
pontos que já tiveram bug real antes. Vale adicionar teste novo sempre que
corrigir um bug de lógica, pra ele nunca mais voltar sem a gente perceber.

⚠️ **Monitoramento de erros:** todo erro registrado com `console.error` (é o
que toda rota já faz antes de responder com erro 500) também é guardado no
banco (coleção `ErrorLog`, expira sozinho em 30 dias) e aparece pra quem tem
acesso de **supervisor de dados** — uma permissão separada do "Gestor" da
equipe, concedida em Equipe → Gestão → Membros → "Tornar supervisor de dados".
Falhas graves do servidor (`uncaughtException`/`unhandledRejection`/queda do
MongoDB) também disparam um **alerta no Telegram**, se configurado (veja
`TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no `.env.example` — o passo a passo
completo de como criar o bot está em `server/utils/telegramAlerta.js`). Não
depende da API do WhatsApp Business nem de verificação de empresa na Meta.

⚠️ **Cache do navegador:** `style.css`, `script.js` e `login.js` são
carregados com `?v=AAAAMMDD` no final da URL (ex: `style.css?v=20260830`).
Isso existe só pra forçar o navegador a buscar a versão nova depois de um
deploy — sem isso, quem já tinha o site aberto continua vendo o CSS/JS
antigo em cache, às vezes por dias. **Toda vez que `style.css`, `script.js`
ou `login.js` for alterado, atualize esse número** (nos três arquivos:
`index.html` e `login.html`) pra data do dia, senão a mudança não aparece
pra quem já visitou o site antes.

⚠️ **Cache de quem instalou como "app" no celular (PWA):** o
`public/sw.js` usa estratégia *network-first* — toda vez que o celular tem
internet, ele busca a versão mais nova do servidor primeiro, e só usa o
que está guardado se estiver offline. Isso significa que **atualizações do
site aparecem sozinhas** pra quem já instalou o app, sem precisar
reinstalar — só abrir o app de novo com internet. Não é preciso mexer em
nada no `sw.js` em atualizações normais do site.

## Estrutura

```
crm-consorcio/
  public/                <- front-end (servido pelo Express)
    index.html            (painel — exige login)
    login.html             (tela de entrar / criar conta)
    css/style.css
    js/script.js           (lógica do painel)
    js/login.js             (lógica do login/cadastro)
  server/                 <- back-end
    server.js
    seed.js                 (cria o funil padrão para cada novo usuário)
    middleware/
      auth.js                (valida o token JWT)
    models/
      User.js
      Column.js
      Card.js
    routes/
      auth.js                (cadastro, login, /me)
      board.js
      columns.js
      cards.js
    package.json
    .env.example
  scripts/                <- scripts de verificação e empacotamento (uso no dia a dia)
    verificar.sh            (roda todas as checagens antes de subir uma mudança)
    gerar-pacote.sh         (gera o .zip pronto pra enviar/publicar)
    verificar-bindings.js   (checagem auxiliar usada pelo verificar.sh)
```

## Scripts de verificação e empacotamento

A pasta `scripts/` tem os comandos que a gente usa pra conferir se está tudo
certo antes de subir uma mudança, e pra gerar o pacote `.zip` pronto pra
publicar. Rode sempre a partir da raiz do projeto:

```bash
# Confere sintaxe do JS (front e back), CSS, HTML e os testes automatizados.
# Não muda nada, só avisa se algo está quebrado. Rode sempre que mexer em código.
bash scripts/verificar.sh

# Faz tudo de uma vez: roda o verificar.sh, aumenta o número de cache (?v=...)
# em 1, gera o dist/crm-consorcio.zip e confere esse .zip numa pasta limpa
# (extrai, "npm install" do zero e roda os testes de novo).
bash scripts/gerar-pacote.sh
```

Se o `verificar.sh` encontrar algum problema, o `gerar-pacote.sh` para e não
gera pacote nenhum — corrija o que foi apontado e rode de novo. O `.zip`
final sempre sai em `dist/crm-consorcio.zip`, sem `.git`, sem `node_modules`
e sem nenhum `.env` com senha de verdade.

## Passo a passo

1. Instale as dependências:
   ```
   cd server
   npm install
   ```

2. Configure o banco e o segredo do login:
   ```
   cp .env.example .env
   ```
   Edite `.env`:
   - `MONGODB_URI` com a sua string de conexão (local ou Atlas)
   - `JWT_SECRET` com qualquer texto longo e aleatório (usado para assinar os tokens de login)

3. Rode o servidor:
   ```
   npm start
   ```

4. Abra `http://localhost:3000`. Como ainda não há sessão, você cai direto em
   `login.html`. Clique em "Criar conta", preencha e-mail e senha — isso já
   cria o seu funil padrão (Leads, Qualificação, Negociação, Fechado, Perdido)
   e te leva pro painel.

## Como funciona o login

- Senhas nunca são salvas em texto puro — são criptografadas com `bcrypt`
  antes de ir pro banco (campo `senhaHash`).
- Ao entrar ou criar conta, a API devolve um token (JWT) que o front-end
  guarda no `localStorage` do navegador.
- Toda requisição ao painel (`/api/board`, `/api/columns`, `/api/cards`)
  manda esse token no header `Authorization: Bearer <token>`. O servidor
  confere o token e descobre de qual usuário são os dados.
- Cada coluna e cada card tem um `userId` — os dados de um usuário nunca
  aparecem para outro.
- O botão "Sair" no painel apaga o token e volta pra tela de login.

## Configurar o "Continuar com Google" (opcional)

O botão já está pronto no código, mas precisa de um Client ID seu pra
funcionar — sem isso, ele mostra uma mensagem discreta em vez do botão.

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   e crie um projeto (ou use um existente).
2. Configure a "Tela de consentimento OAuth" (tipo "Externo" funciona
   para a maioria dos casos).
3. Em "Credenciais" → "Criar credenciais" → "ID do cliente OAuth":
   - Tipo de aplicativo: **Aplicativo da Web**
   - Em "Origens JavaScript autorizadas", adicione a URL do seu site
     (ex: `https://seudominio.com.br` e, para testar local,
     `http://localhost:3000`)
4. Copie o Client ID gerado (termina em `.apps.googleusercontent.com`).
5. Cole em dois lugares:
   - No `.env` do servidor: `GOOGLE_CLIENT_ID=seu-client-id-aqui`
   - No arquivo `public/js/login.js`, na linha que diz
     `const GOOGLE_CLIENT_ID = 'COLOQUE_SEU_GOOGLE_CLIENT_ID_AQUI...'`
6. Reinicie o servidor (ou refaça o deploy). O botão aparece sozinho.

Quem entrar com Google e já tiver uma conta com o mesmo e-mail cadastrada
por senha continua na mesma conta (o Google só é "linkado" a ela).

## Configurar a sincronização com a Google Agenda (opcional)

Usa o mesmo projeto do Google Cloud de cima, mas precisa de **duas coisas a
mais** além do Client ID que você já tem:

1. Volte em **Credenciais** → clique no ID do cliente OAuth que você já
   criou (o mesmo do login) → em **"URIs de redirecionamento
   autorizados"**, adicione:
   - `https://seudominio.com.br/api/calendar/callback` (produção)
   - `http://localhost:3000/api/calendar/callback` (se for testar local)

   ⚠️ Isso é diferente das "Origens JavaScript autorizadas" que você já
   preencheu pro login — sem essa URL de redirecionamento cadastrada, o
   Google recusa a conexão com erro `redirect_uri_mismatch`.

2. Na mesma tela, copie o **Client Secret** (fica visível ao lado do
   Client ID) e adicione no `.env`:
   ```
   GOOGLE_CLIENT_SECRET=seu-client-secret-aqui
   ```
   (No Render, adicione como variável de ambiente também, igual às outras.)

3. Se a tela de consentimento OAuth do seu projeto ainda estiver em modo
   **"Testando"** (comum pra projetos pessoais), adicione seu e-mail em
   **"Usuários de teste"** — senão o Google recusa a conexão.

Depois disso, é só clicar em **Conectar Google Agenda** dentro do painel
(ícone de engrenagem → seção "Google Agenda"). Um calendário novo chamado
**"Painel do Consórcio — Tarefas"** é criado automaticamente na sua conta
Google — só ele é usado, seus outros compromissos não são tocados.

⚠️ **Limitação do modo "Testando":** enquanto o projeto não passar pela
verificação do Google (processo à parte, opcional), a conexão expira a
cada 7 dias e você precisa clicar em "Conectar" de novo. Pra uso pessoal
isso costuma ser tranquilo; se incomodar, me avise que vejo com você o
processo de verificação.

⚠️ **Erro "Acesso bloqueado: a solicitação desse app é inválida":** o
servidor monta a URL de retorno automaticamente a partir do protocolo da
requisição (`req.protocol`). Atrás de um proxy (Render e a maioria dos
serviços de hospedagem funcionam assim), sem `app.set('trust proxy', 1)`
configurado, o Express enxerga a conexão como HTTP mesmo em produção — a
URL enviada ao Google fica `http://...` em vez de `https://...`, não bate
com o que está cadastrado no Google Cloud Console, e o Google bloqueia.
Isso já está corrigido no `server.js`; só vira problema de novo se algum
dia migrar pra uma hospedagem com proxy configurado de um jeito diferente.

## Estrutura de páginas (front-end)

O painel agora tem uma barra lateral com 5 páginas (tudo dentro do mesmo
`script.js`, sem recarregar a página):
- **Dashboard** — métricas do período (leads, em negociação, ganho,
  conversão), gráfico de leads captados, pipeline por etapa, últimos
  leads e tarefas abertas
- **Pipeline** — o quadro kanban original (arrastar cards, colunas,
  filtro por mês, WhatsApp, etc.), agora dividido em **funis** — abas
  no topo da página, cada uma com seu próprio conjunto de colunas e
  clientes. Dá pra ter, por exemplo, um funil "Consórcio Imóvel" e
  outro "Consórcio Auto" totalmente separados. Contas criadas antes
  desse recurso ganham automaticamente um "Funil Principal" com as
  colunas que já existiam — nada se perde. O botão "+" no cabeçalho
  de cada coluna agora pergunta primeiro entre três opções: "Novo
  cliente", "Transferir cliente existente" (move de verdade, some de
  onde estava) ou "Copiar cliente existente" (cria uma cópia
  independente aqui, mantendo o original intacto onde já estava —
  útil pra acompanhar a mesma pessoa em mais de um funil). As duas
  últimas usam o mesmo seletor (um por um, ou "Selecionar todos"),
  disponível a qualquer momento, em qualquer coluna.
  As estatísticas agora incluem **Ticket médio** e **Valor ponderado**
  (esse último usa a "chance de fechar" de cada coluna, configurável
  no menu dela — só faz sentido pras colunas "em aberto"). Tem também
  um filtro **"🧊 Esfriando"** que mostra só os leads em aberto sem
  nenhuma atualização há mais de 7 dias
- **Leads** — todos os clientes em formato de tabela, com busca,
  filtro por etapa e um botão de **exportar** em CSV
- **Comissões** — contratos de comissão por mês, com cálculo automático
  das parcelas a partir do valor da carta de crédito vendida (regra fixa:
  10 parcelas × 0,00103388 + 3 parcelas × 0,00190561)
- **Tarefas** — lista de tarefas com prioridade, vencimento e lead
  relacionado
- **Conversas** — todas as conversas do WhatsApp Business, ordenadas
  pela mensagem mais recente; clicar numa abre o card do cliente
- **Relatórios** — novos leads por mês (últimos 6 meses), leads por
  qualificação, totais de ganho/perdido, e exportação em CSV. Tem um
  seletor para ver "Todos os funis" ou um específico
- **Disparos** — envia a mesma mensagem de WhatsApp para vários leads
  de uma vez, com filtro por coluna e qualificação. Também aceita
  **modelos de mensagem aprovados** (necessário pra alcançar leads
  frios, fora da janela de 24h de texto livre)
- **Automações** — cria regras com dois gatilhos possíveis: "quando o
  cliente entra numa coluna" (na hora) ou "quando fica X dias parado
  numa coluna" (checado a cada hora pelo servidor). A ação pode ser
  criar uma tarefa ou mover pra outra coluna
- **Fluxos** — uma versão mais forte das automações: em vez de uma
  ação só, uma **sequência de etapas no tempo**, cada uma "X dias
  depois do início" (enviar mensagem de WhatsApp, criar tarefa, ou
  mover de coluna). Começa quando o cliente entra na coluna
  escolhida, e o servidor confere a cada hora se já chegou a hora da
  próxima etapa de cada cliente
- **Chat Interno** — um canal de conversa único por equipe, entre quem
  faz parte dela
- **Supervisão** — visível só pra quem é supervisor(a) da equipe:
  código de convite, gerenciar membros (promover/rebaixar/remover) e
  um resumo do desempenho de cada um (leads, em negociação, ganho,
  perdido) — nunca os clientes/negociações em si, só os totais
- **Suporte** — perguntas frequentes e um link de contato por e-mail.
  Fica no rodapé da barra lateral, junto com Configurações
- **Configurações** — uma página só, em três seções na ordem Perfil →
  Integrações → Aparência. Os botões no topo rolam a tela até a seção
  correspondente. O botão de acesso fica no rodapé da barra lateral,
  separado dos outros, acima do "Sair". Inclui **foto de perfil**
  (redimensionada automaticamente pro navegador antes de enviar, com
  fallback nas iniciais do nome quando não há foto) e **"Sessões
  ativas"**, um botão que invalida todos os tokens de login já
  emitidos — útil se perdeu um aparelho ou compartilhou a senha

Também tem um **sino de notificações** no topo de todas as páginas,
com tarefas vencendo, leads novos e mensagens recebidas nas últimas
48h — calculado na hora a partir do que já está carregado, sem
nenhuma tabela nova no banco.

## Configurar a API do WhatsApp Business (opcional)

Isso é diferente do botão de WhatsApp que já existia (aquele só abre uma
conversa externa). Com essa integração, as mensagens passam a ficar
registradas dentro do CRM — dá pra ver o histórico e responder sem sair
do painel.

**O que você precisa preparar no Meta:**

1. Crie/acesse uma conta em [business.facebook.com](https://business.facebook.com)
2. Vá em [developers.facebook.com/apps](https://developers.facebook.com/apps), crie um app do tipo "Empresa" e adicione o produto **WhatsApp**
3. No painel do produto WhatsApp, você já ganha um número de teste — ou
   pode adicionar seu próprio número comercial (ele não pode continuar
   logado no WhatsApp normal do celular ao mesmo tempo)
4. Copie o **Phone Number ID** (aparece na tela inicial do produto WhatsApp)
5. Gere um **Access Token permanente**: Configurações da Empresa →
   Usuários do sistema → crie um usuário do sistema → gere um token com
   permissão `whatsapp_business_messaging`
6. (Opcional) copie o **WABA ID** (ID da conta do WhatsApp Business),
   útil se você quiser gerenciar modelos de mensagem depois

**Configure o webhook (pra receber mensagens):**

1. No painel do produto WhatsApp → Configuração → Webhook
2. URL de retorno de chamada: `https://seudominio.com.br/api/whatsapp/webhook`
3. Token de verificação: qualquer texto que você escolher — coloque esse
   mesmo valor no `.env` como `WHATSAPP_VERIFY_TOKEN` (e no Render também)
4. Inscreva-se no campo `messages`

**No painel do CRM:**

1. Configurações → Integrações → WhatsApp Business API
2. Cole o Phone Number ID e o Access Token → Conectar

Depois disso, qualquer mensagem que o cliente mandar pro seu número
aparece automaticamente como um card novo no Pipeline (se ainda não
existir um cliente com aquele telefone) e fica registrada na conversa
dentro do card — acessível pelo botão "Ver conversa" no modal de edição.

⚠️ **Sobre o primeiro contato:** a API só deixa mandar texto livre pra
quem já te escreveu nas últimas 24h. Pra iniciar uma conversa com
alguém que nunca falou com você, é preciso usar um "modelo de mensagem"
aprovado pela Meta — crie e acompanhe o status deles em Configurações
→ Integrações → **Templates de mensagem** (cria e manda pra aprovação
da Meta direto pelo painel; "Sincronizar da Meta" atualiza o status de
cada um: aprovado, em análise ou rejeitado). Pra usar um template já
aprovado, vá em Disparos e ligue a opção "Usar modelo de mensagem".

⚠️ **Custo:** a Meta cobra por conversa iniciada (varia por categoria e
país), geralmente com uma cota gratuita mensal. Consulte a página de
preços da Meta antes de usar em produção.

## Configurar a captação de leads via Instagram/Facebook (opcional)

Usa o mesmo App do Meta que você já criou pro WhatsApp Business — não
precisa cadastrar outro. Toda vez que alguém preenche um formulário de
anúncio (mesmo rodando no Instagram, ele é sempre vinculado a uma
Página do Facebook), um lead novo é criado automaticamente na primeira
coluna "em aberto". Além disso, **mensagens diretas (DM) do Instagram
também chegam na aba Conversas**, junto com as do WhatsApp — inbox
unificado de verdade, e você responde dali mesmo.

**No painel do Meta (mesmo App do WhatsApp):**

1. Adicione o produto **Marketing API** ao App (Adicionar produto)
2. Configurações da Empresa → Contas → Páginas → conecte sua Página do
   Facebook (com o Instagram profissional já vinculado a ela) ao App
3. Configurações da Empresa → Usuários do sistema → gere um **token de
   acesso de página** com as permissões `leads_retrieval`,
   `pages_manage_ads`, `pages_show_list`, `instagram_basic` e
   `instagram_manage_messages` (essas duas últimas são só pras
   mensagens diretas — se só quiser captar leads de formulário, pode
   deixar de fora)
4. No produto Webhooks do App (o mesmo onde você cadastrou o do
   WhatsApp): URL `https://seudominio.com.br/api/instagram/webhook`,
   token de verificação = o mesmo valor que você colocar em
   `INSTAGRAM_VERIFY_TOKEN` no `.env`/Render — inscreva-se no campo
   `leadgen` (leads de formulário) e também no objeto **Instagram**,
   campo `messages` (pras mensagens diretas)
5. Anote o **ID da conta comercial do Instagram** (não é o Page ID) —
   aparece em Configurações da Empresa → Contas → Contas do Instagram

**No painel do CRM:**

1. Configurações → Integrações → Instagram (captação de leads)
2. Cole o Page ID, o Access Token da página e (se for usar mensagens
   diretas) o ID da conta comercial do Instagram → Conectar

⚠️ Os nomes dos campos do formulário variam de anúncio pra anúncio.
O sistema tenta reconhecer automaticamente nome, telefone e e-mail a
partir dos nomes mais comuns (`full_name`, `phone_number`, `email`,
entre outros) — se o seu formulário usar nomes de campo muito
diferentes disso, talvez alguns dados não sejam capturados
corretamente na primeira tentativa.

⚠️ O formato exato dos eventos de webhook de mensagens do Instagram
pode variar um pouco conforme a versão da API — se as mensagens não
aparecerem na aba Conversas depois de configurado, confira os logs do
servidor (ou o Monitoramento de erros, se você tiver acesso de
supervisor de dados) pra ver se o formato recebido bateu com o
esperado.

## Funis, equipe, PWA e guia de uso

- **Duplicar funil** — botão "⧉" nas abas do Pipeline, ao lado de
  renomear/excluir. Copia a estrutura de colunas (nome, tipo,
  probabilidade) pra um funil novo — os clientes não são duplicados,
  só a estrutura
- **Ranking de desempenho** — em Supervisão, acima da tabela
  detalhada que já existia: lista os membros da equipe ordenados por
  valor ganho, com barra comparando cada um contra quem está na
  frente
- **Modo arquivado** — no modal do cliente, botão "📦 Arquivar" tira
  ele de vista do Pipeline e da aba Leads sem excluir nada. Na aba
  Leads, o botão "📦 Ver arquivados" alterna pra ver só os
  arquivados (com opção de desarquivar a qualquer momento)
- **PWA (instalável no celular)** — `manifest.json` + service worker
  mínimo (`public/sw.js`) + ícones em `public/icons/`. As chamadas de
  API nunca ficam em cache (sempre buscam dado atual do servidor);
  só a "casca" do app (html/css/js) é cacheada, pra abrir mais rápido
  em visitas seguintes. Pra instalar: abra o site no celular e use
  "Adicionar à tela inicial" (Android) ou "Adicionar à Tela de
  Início" (iPhone)
- **Guia rápido de uso** — `docs/guia-rapido-painel-crm.docx`, um
  documento Word separado do README (que é técnico, pra quem mexe no
  código) — esse é voltado pra quem vai usar o painel no dia a dia:
  cadastrar cliente, mover pelo funil, WhatsApp, tarefas, proposta,
  busca rápida e importar planilha. Bom pra treinar gente nova da
  equipe

## Propostas, meta de vendas, PDF, 2FA e auditoria

- **Propostas em PDF** — no modal do cliente, botão "📄 Gerar proposta":
  informa valor da carta, número de parcelas e validade, e baixa um
  PDF pronto (usa a biblioteca **jsPDF**, carregada via CDN)
- **Meta de vendas** — no Dashboard, defina uma meta de valor pro mês
  e acompanhe uma barra de progresso comparando com o que já foi
  vendido (soma dos clientes na(s) coluna(s) "ganho") naquele mês
- **Exportar relatório em PDF** — botão "Exportar PDF" na página
  Relatórios, mesma biblioteca jsPDF
- **Verificação em duas etapas (2FA)** — em Configurações → Login e
  segurança. Usa o padrão TOTP (compatível com Google Authenticator,
  Authy, etc.), **implementado do zero usando só o `crypto` nativo do
  Node** — nenhuma dependência nova no `package.json`. O QR code é
  desenhado no navegador via a biblioteca `qrcodejs` (CDN). Ao entrar
  numa conta com 2FA ativo, o login pede o código antes de liberar o
  token de verdade — o token intermediário dessa etapa dura só 5
  minutos e nunca dá acesso a nenhuma rota normal da API
- **Log de auditoria** — na mesma seção de Login e segurança, mostra
  os últimos 100 eventos de segurança da própria conta (login,
  desconectar todos os dispositivos, cliente excluído, membro
  removido da equipe, 2FA ativado/desativado)

## Importar/Exportar (planilha → possíveis leads)

Página própria na barra lateral, separada do "Importar leads" simples
que já existia em Configurações (aquele continua existindo, pra quando
você já sabe exatamente pra qual coluna vai cada linha). Esta é pra
quando os dados vêm crus e ainda faltam informações:

1. Suba um arquivo **.csv ou .xlsx** — lido no próprio navegador, sem
   precisar de nenhum programa
2. O sistema detecta as colunas da planilha e tenta adivinhar quais
   são nome/telefone/serviço (pelo nome da coluna) — mas você pode
   trocar qualquer uma antes de confirmar
3. Depois de importar, cada linha vira um **"possível lead"**, numa
   lista separada da aba Leads — nada é adicionado ao Pipeline ainda
4. Clique em "Completar" pra revisar/corrigir nome e telefone, definir
   valor, temperatura e a coluna de destino — só então ele vira um
   cliente de verdade na aba Leads. "Descartar" remove um possível
   lead sem promovê-lo (duplicado, contato errado, etc.)

A leitura da planilha usa a biblioteca SheetJS, carregada via CDN no
`index.html` — trata .csv e .xlsx da mesma forma no navegador.

## Busca global, histórico, etiquetas, campos e anexos

- **Busca global** — atalho **Ctrl+K** (⌘K no Mac) ou o ícone de lupa
  no topo da página, abre uma busca rápida por cliente ou tarefa
- **Histórico de atividades** — botão "🕘 Ver histórico" no modal do
  cliente, mostra uma linha do tempo com criação do cliente, tarefas
  e mensagens do WhatsApp, mais recentes primeiro. É calculado na
  hora a partir do que já existe — não é uma tabela nova no banco
- **Etiquetas** — campo livre no modal do cliente (separadas por
  vírgula), aparecem como pílulas no card do Pipeline e no modal
- **Campos personalizados** — em Configurações → Integrações, crie
  campos extras (texto, número ou data) que passam a aparecer no
  modal de todos os clientes. Excluir um campo não apaga os valores
  já preenchidos nos clientes, só para de mostrar
- **Anexos** — no modal do cliente, suba arquivos (imagem ou PDF, até
  ~3 MB cada). Ficam guardados como base64 direto no MongoDB — não
  precisa de nenhum serviço de armazenamento externo, mas por isso o
  limite de tamanho é mais apertado que um serviço de arquivos de
  verdade ofereceria

## Equipes (Chat Interno e Supervisão)

Diferente de tudo mais no projeto, isso não é uma funcionalidade "por
usuário" — é uma camada nova, sem mexer em nenhum dado que já existia:

- Cada pessoa continua com seu **funil totalmente separado** (colunas,
  clientes, tarefas — nada disso é compartilhado)
- Uma equipe é só um agrupamento: quem cria vira **supervisor(a)**
  automaticamente e ganha um código de convite
- Quem entra com o código vira **membro** — o funil dele continua
  100% dele, só ganha acesso ao chat interno da equipe
- Só supervisores veem a página **Supervisão**, com um resumo agregado
  (quantos leads, quanto está em negociação/ganho/perdido) de cada
  membro — nunca os clientes individuais de ninguém
- Uma pessoa só pode estar em **uma equipe por vez**. Sair da equipe
  (ou ser removido) não apaga nada do funil dela

## Comissão automática ao fechar venda

Quando um cliente entra numa coluna do tipo **"ganho"** (fechado) — seja
arrastando no Pipeline, criando direto nela, transferindo, copiando, ou
promovendo de um possível lead — o sistema cria a comissão dele
automaticamente na aba **Comissões**, usando o valor da carta cadastrado no
cliente. Some ao "Ganho" gerado, aparece com a marcação **"⚡ Gerada pelo
Pipeline"** pra diferenciar de uma comissão criada manualmente.

Só gera **uma vez por cliente** — mover o mesmo cliente entre colunas
"ganho" diferentes, ou editá-lo depois, não duplica. Se o cliente não tiver
valor cadastrado (R$ 0), nada é gerado automaticamente; dá pra criar a
comissão manualmente depois, como sempre.

⚠️ Mover o cliente de volta pra fora da coluna "ganho" **não** apaga a
comissão já gerada — ela fica registrada normalmente, e só pode ser
removida manualmente em Comissões.

## Recursos de IA

Usam a API da Anthropic (modelo Haiku, rápido e barato — dá pra trocar
em `server/utils/anthropic.js` se quiser mais qualidade em troca de
custo maior). Precisam da variável `ANTHROPIC_API_KEY` no `.env`
(gere em https://console.anthropic.com/settings/keys). Sem essa chave
configurada, os botões continuam aparecendo mas mostram uma mensagem
de erro ao clicar.

- **Sugerir mensagem** — no modal de editar cliente, ao lado do botão
  do WhatsApp: gera um rascunho de mensagem de retomada de contato
  personalizado, com opção de copiar ou já abrir o WhatsApp com o
  texto preenchido
- **Sugerir tarefa de acompanhamento** — no modal de editar cliente,
  perto de Observações: sugere uma tarefa com prazo, que pode ser
  criada com um clique
- **Insights da IA** — no Dashboard, um painel com botão "Gerar" que
  lista de 2 a 4 alertas curtos sobre o estado atual do funil (não
  gera sozinho, só quando você pede — pra não pesar a tela nem gastar
  chamadas de API à toa)
- **IA proativa em Negociações** — diferente dos recursos acima (que
  só geram quando você pede), essa analisa a conversa sozinha toda
  vez que o cliente responde no WhatsApp e deixa uma sugestão de
  mensagem de follow-up + tarefa prontas dentro do card — mas nunca
  envia nada nem cria nada sozinha, sempre espera você confirmar.
  Liga em Configurações → Integrações → WhatsApp Business API, sem
  precisar de confirmação especial pra ativar (não tem risco de
  mandar mensagem indevida, porque não manda nada)

### ⚠️ Agente IA autônomo (opcional, desligado por padrão)

Diferente dos recursos acima (que só sugerem, você decide se envia),
esse **responde o cliente sozinho, sem revisão humana**. Fica em
Configurações → Integrações → WhatsApp Business API, só aparece
depois de conectar o WhatsApp, e pede uma confirmação explícita antes
de ligar.

Regra de segurança embutida: sempre que você responder um cliente
manualmente, o agente fica em silêncio por 30 minutos naquela
conversa — pra nunca responder por cima de um atendimento humano em
andamento. Pode ser desativado a qualquer momento, e o aviso de que
está ativo fica visível na tela enquanto ligado.

A etapa "Enviar mensagem" dos **Fluxos** usa a mesma trava de
segurança (fica 30 min em silêncio se um humano respondeu
manualmente) — mas é diferente do agente: aqui a mensagem é o texto
exato que você escreveu, não algo gerado pela IA na hora. Ao criar ou
ativar um fluxo com essa etapa, o painel avisa antes de confirmar.

## Menu de triagem (fluxo de primeiro contato)

Em Configurações → Integrações → WhatsApp Business API: quando alguém
manda mensagem pela primeira vez (número que ainda não é lead seu), o
CRM responde automaticamente com uma mensagem de menu que você
escreve (ex: "1 - Simulação, 2 - Já sou cliente..."). Quando a pessoa
responde com um número que bate com uma das opções configuradas, o
lead é movido pra coluna escolhida e (se você preencheu) uma mensagem
de confirmação é enviada. Se a resposta não bater com nenhuma opção,
o CRM simplesmente segue o fluxo normal (sem travar nada).

⚠️ Como isso manda mensagem automática pra qualquer contato novo, o
painel pede confirmação antes de salvar com o menu ativado.

Limitação atual: mover o lead pela resposta do menu **não** dispara
Automações nem Fluxos ligados àquela coluna (só o "arrastar" manual,
criar direto na coluna, transferir/copiar, ou os processadores de
Automações/Fluxos disparam isso hoje).

## Mensagens agendadas

Nova aba "Agendamentos" na barra lateral: agende uma mensagem de
WhatsApp pra um cliente específico, numa data e hora futura. Um
painel mostra quantas estão a enviar, já enviadas, canceladas ou que
falharam. O servidor confere a cada **5 minutos** se alguma já passou
do horário — é um pouco mais frequente que os outros verificadores
(Automações e Fluxos rodam de hora em hora), justamente pra respeitar
melhor o horário escolhido.

**Autenticação (públicas):**
- `POST /api/auth/register` — `{ nome, email, senha }` → cria conta + funil padrão
- `POST /api/auth/login` — `{ email, senha }` → retorna token
- `POST /api/auth/google` — `{ credential }` (token do Google) → cria/liga conta e retorna token
- `GET  /api/auth/me` — dados do usuário logado (exige token)
- `PUT  /api/auth/nome` — `{ nome }` → muda o nome de exibição da conta
- `POST /api/auth/logout-all` — invalida todos os tokens de login já emitidos (exige token)
- `PUT  /api/auth/avatar` — `{ avatarUrl }` → salva a foto de perfil, já em base64 pequeno (exige token)
- `PUT  /api/auth/password` — `{ senhaAtual, senhaNova }` → troca (ou define) a senha da conta

**Painel (exigem token, sempre isoladas por usuário):**
- `GET  /api/funis` — lista os funis (cria "Funil Principal" e migra colunas antigas se necessário)
- `POST /api/funis` — cria funil vazio
- `PUT  /api/funis/:id` — renomeia funil
- `DELETE /api/funis/:id` — exclui funil, colunas e cards dele (exige ao menos 1 funil restante)
- `GET  /api/board` — colunas + cards
- `POST /api/columns` — cria coluna (dentro de um funil, via `funilId`)
- `PUT  /api/columns/:id` — renomeia / muda tipo
- `DELETE /api/columns/:id` — exclui coluna (e os cards dela)
- `POST /api/cards` — cria cliente
- `PUT  /api/cards/:id` — edita cliente
- `PUT  /api/cards/:id/move` — move cliente entre colunas (drag and drop)
- `DELETE /api/cards/:id` — exclui cliente
- `GET  /api/cards/:id/anexos` — lista os anexos de um cliente
- `POST /api/cards/:id/anexos` — `{ nomeArquivo, tipoMime, dadosBase64 }` → sobe um anexo (~3 MB no máximo)
- `DELETE /api/cards/:id/anexos/:anexoId` — remove um anexo

**Tarefas (exigem token, isoladas por usuário):**
- `GET  /api/tasks` — lista as tarefas
- `POST /api/tasks` — cria tarefa
- `PUT  /api/tasks/:id` — edita tarefa
- `PUT  /api/tasks/:id/toggle` — marca/desmarca como concluída
- `DELETE /api/tasks/:id` — exclui tarefa (e o evento correspondente na Agenda)
- `POST /api/tasks/sync-calendar` — puxa da Google Agenda o que mudou de lá pra cá

**Comissões (exigem token, isoladas por usuário):**
- `GET  /api/comissoes` — lista os contratos
- `POST /api/comissoes` — cria contrato (parcelas calculadas automaticamente)
- `PUT  /api/comissoes/:id` — edita contrato (recalcula se o valor da carta mudar)
- `DELETE /api/comissoes/:id` — exclui contrato

**Google Agenda (exigem token):**
- `GET  /api/calendar/status` — diz se o usuário já conectou a Agenda
- `GET  /api/calendar/connect-url` — devolve a URL de autorização do Google
- `GET  /api/calendar/callback` — o Google redireciona pra cá após o consentimento (não chame direto)
- `POST /api/calendar/disconnect` — desconecta (não apaga os eventos já criados)

**IA (exigem token):**
- `POST /api/ai/mensagem` — `{ cardId }` → sugere mensagem de WhatsApp para o cliente
- `POST /api/ai/insights` — gera de 2 a 4 alertas curtos sobre o funil atual
- `POST /api/ai/sugerir-tarefa` — `{ cardId }` → sugere título e prazo de uma tarefa de acompanhamento

**Equipes (exigem token):**
- `GET  /api/equipe` — dados da equipe do usuário logado (ou `null`)
- `POST /api/equipe` — `{ nome }` → cria equipe (quem cria vira supervisor)
- `POST /api/equipe/entrar` — `{ codigo }` → entra numa equipe existente
- `POST /api/equipe/sair` — sai da equipe atual
- `POST /api/equipe/regenerar-codigo` — gera novo código de convite (só supervisor)
- `PUT  /api/equipe/membro/:userId/papel` — `{ papel }` → promove/rebaixa (só supervisor)
- `DELETE /api/equipe/membro/:userId` — remove um membro (só supervisor)
- `GET  /api/equipe/chat` — mensagens do chat interno
- `POST /api/equipe/chat` — `{ texto }` → envia mensagem no chat interno
- `GET  /api/equipe/supervisao` — resumo de desempenho de cada membro (só supervisor)

**WhatsApp Business:**
- `GET  /api/whatsapp/webhook` — verificação do webhook (chamada pela Meta, não chame direto)
- `POST /api/whatsapp/webhook` — recebe mensagens e status (chamada pela Meta, pública)
- `GET  /api/whatsapp/status` — diz se o usuário já conectou (exige token)
- `POST /api/whatsapp/configurar` — `{ phoneNumberId, accessToken, wabaId }` (exige token)
- `POST /api/whatsapp/desconectar` — (exige token)
- `GET  /api/whatsapp/conversas/:cardId` — histórico de mensagens do cliente (exige token)
- `POST /api/whatsapp/enviar` — `{ cardId, texto }` → envia mensagem (exige token)
- `GET  /api/whatsapp/conversas` — lista todas as conversas, ordenadas pela mais recente (exige token)
- `POST /api/whatsapp/disparo` — `{ cardIds, texto }` ou `{ cardIds, usarTemplate:true, templateName, idioma, variaveis }` → envia (exige token)
- `GET  /api/whatsapp/templates` — lista os modelos de mensagem com status (aprovado/em análise/rejeitado) (exige token e WABA ID configurado)
- `POST /api/whatsapp/templates` — `{ nome, categoria, idioma, texto }` → cria um template e manda pra aprovação da Meta (exige token e WABA ID configurado)
- `POST /api/whatsapp/enviar-template` — `{ cardId, templateName, idioma, variaveis }` → envia um modelo (exige token)
- `POST /api/whatsapp/agente-ia` — `{ ativo }` → liga/desliga o agente que responde clientes sozinho (exige token)
- `POST /api/whatsapp/ia-proativa` — `{ ativo }` → liga/desliga a IA que só sugere no card (exige token)
- `GET  /api/whatsapp/menu-triagem` — configuração atual do menu de primeiro contato (exige token)
- `PUT  /api/whatsapp/menu-triagem` — `{ ativo, mensagemInicial, opcoes }` → salva o menu de triagem (exige token)

**Automações (exigem token):**
- `GET  /api/automacoes` — lista as automações do usuário
- `POST /api/automacoes` — `{ nome, colunaGatilhoId, acaoTipo, acaoParams }` → cria
- `PUT  /api/automacoes/:id` — edita (nome, ativa/inativa, parâmetros da ação)
- `DELETE /api/automacoes/:id` — exclui

**Fluxos (exigem token):**
- `GET  /api/fluxos` — lista os fluxos do usuário, com quantos clientes estão em andamento em cada um
- `POST /api/fluxos` — `{ nome, colunaGatilhoId, etapas }` → cria
- `PUT  /api/fluxos/:id` — edita (nome, coluna, etapas, ativo/inativo)
- `DELETE /api/fluxos/:id` — exclui (e apaga as execuções em andamento)

**Agendamentos (exigem token):**
- `GET  /api/agendamentos` — lista as mensagens agendadas, com contagem por status
- `POST /api/agendamentos` — `{ cardId, texto, agendadoPara }` → agenda uma nova mensagem
- `POST /api/agendamentos/:id/cancelar` — cancela uma pendente
- `DELETE /api/agendamentos/:id` — remove da lista (qualquer status)

**Campos personalizados (exigem token):**
- `GET  /api/campos-personalizados` — lista os campos do usuário
- `POST /api/campos-personalizados` — `{ nome, tipo }` → cria (`tipo`: texto, numero ou data)
- `DELETE /api/campos-personalizados/:id` — exclui a definição do campo

**Possíveis leads (exigem token):**
- `GET  /api/possiveis-leads` — lista os pendentes
- `POST /api/possiveis-leads/importar` — `{ linhas: [{nome,telefone,tipoServico}], origemArquivo }` → importa em lote (a planilha já foi lida no navegador antes)
- `POST /api/possiveis-leads/:id/promover` — `{ nome, telefone, columnId, valor, temperatura, obs, mes }` → vira um cliente de verdade
- `DELETE /api/possiveis-leads/:id` — descarta

**Metas de vendas (exigem token):**
- `GET  /api/metas/:mes` — meta do mês (formato `YYYY-MM`), 0 se ainda não definida
- `PUT  /api/metas/:mes` — `{ valorMeta }` → define/atualiza

**Auditoria (exige token):**
- `GET  /api/auditoria` — últimos 100 eventos de segurança da própria conta

**2FA — dentro de `/api/auth` (as duas primeiras são públicas, o resto exige token):**
- `POST /api/auth/2fa/validar-login` — `{ tempToken, codigo }` → segunda etapa do login, devolve o token de verdade
- `POST /api/auth/2fa/iniciar` — gera um novo segredo e devolve o QR code (ainda não ativa)
- `POST /api/auth/2fa/confirmar` — `{ codigo }` → confirma o primeiro código e ativa de vez
- `POST /api/auth/2fa/desativar` — `{ codigo }` → exige o código atual pra desligar

**Instagram/Facebook Lead Ads:**
- `GET  /api/instagram/webhook` — verificação do webhook (chamada pela Meta, não chame direto)
- `POST /api/instagram/webhook` — recebe eventos de novo lead (chamada pela Meta, pública)
- `GET  /api/instagram/status` — diz se o usuário já conectou (exige token)
- `POST /api/instagram/configurar` — `{ pageId, pageAccessToken }` (exige token)
- `POST /api/instagram/desconectar` — (exige token)
# crm-consorcio
