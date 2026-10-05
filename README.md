# Cardápio Digital — servidor

Sistema de pedidos para vários restaurantes ao mesmo tempo: pedidos na **mesa** (QR Code), **retirada** e **delivery**, com a cozinha e o entregador recebendo tudo em **tempo real**.

- **ChefOnline (página inicial, `seusite.com.br/`):** vitrine com todos os restaurantes. O cliente **não faz cadastro** para pedir na mesa, retirar ou pagar a entrega na porta. Só quem escolhe **pagar a entrega pelo site** entra com uma conta. Os pedidos ficam guardados no próprio aparelho, onde ele acompanha em tempo real e avalia depois da entrega.
- **Cliente direto no restaurante:** `seusite.com.br/r/nome-do-restaurante` (delivery e retirada) ou o QR Code da mesa, sem precisar de conta.
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
   - Cardápio: http://localhost:3000/r/casa-jabuticaba
   - Painel: http://localhost:3000/painel

Logins do exemplo (senha `jabuticaba123`):
- `dono@casajabuticaba.com`
- `cozinha@casajabuticaba.com`
- `carlos@casajabuticaba.com` e `rafa@casajabuticaba.com` (entregadores)

**Troque essas senhas antes de usar com clientes reais.**

Para testar o tempo real, abra o cardápio no celular e o painel no computador, os dois apontando para o mesmo servidor.

## Colocar no ar

### 1. Código: GitHub

1. Crie uma conta em **github.com** e um repositório **privado** (por exemplo `cardapio-digital`).
2. Envie esta pasta para o repositório. O arquivo `.env` **não** vai junto, e é assim que deve ser.

### 2. Banco e servidor: Render (um clique com o Blueprint)

1. Crie uma conta em **render.com** e conecte o GitHub.
2. Clique em **New > Blueprint** e escolha o repositório. O arquivo `render.yaml` já cria duas coisas, ligadas entre si:
   - o banco **PostgreSQL** (`cardapio-db`);
   - o **servidor** (`cardapio-digital`).

   O `DATABASE_URL` e o `JWT_SECRET` são preenchidos sozinhos.
3. Preencha só o `PUBLIC_URL`, com o endereço do site, por exemplo `https://cardapio-digital.onrender.com`.
4. Aguarde o deploy. Na primeira vez, o servidor cria todas as tabelas sozinho. Teste em `https://SEU-SITE/api/saude`, que deve responder `{"ok":true}`.
5. Crie o restaurante de exemplo e a primeira conta de dev. No Render, abra o banco, copie a **External Database URL**, coloque no seu `.env` como `DATABASE_URL` e rode no seu computador:
   ```
   npm run seed
   npm run novo-admin -- --nome "Seu Nome" --email voce@email.com --senha "umaSenhaBemForte"
   ```

O plano **Starter** do servidor fica sempre ligado. Os planos e preços do banco aparecem na hora de criar: escolha o menor para começar e aumente quando houver mais restaurantes. Confira os valores atuais no site do Render.

**Alternativa:** usar o banco no **Neon** ou no **Supabase**, que têm plano gratuito, e só o servidor no Render. Nesse caso, apague o bloco `databases` do `render.yaml` e coloque o endereço do banco em `DATABASE_URL` na mão.

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

**Pagamento pelo site:** o pedido fica "aguardando pagamento" e só chega à cozinha depois de aprovado. Se não for pago em 30 minutos, é cancelado sozinho, sem cobrar nada. Hoje o pagamento funciona em **modo de demonstração** (`PAGAMENTO_PROVEDOR=demo`): uma tela com os botões "Simular pagamento aprovado" e "recusado", que não pede cartão. Quando escolherem a empresa (Mercado Pago, PagBank, Asaas...), ela entra em `src/lib/pagamentos.js`. O número do cartão nunca passa pelo nosso servidor: o cliente digita na página segura da empresa. O pagamento pelo site só aparece no ChefOnline, porque precisa de conta; o link próprio do restaurante (`/r/...`) oferece só o pagamento na entrega. Para desligar em um restaurante: `/admin` → Funções → "Pagamento pelo site". Para desligar em todos: `PAGAMENTO_PROVEDOR=off`.

## Cliente sem cadastro

- **Mesa:** o QR Code abre `/r/restaurante/mesa/5?t=código` direto no cardápio daquela mesa. Sem login.
- **Link do restaurante e ChefOnline:** o cliente informa nome e WhatsApp (e CPF, se for entrega paga na porta) na hora de pedir. O aparelho lembra nome e WhatsApp para o próximo pedido.
- **Acompanhar:** cada pedido gera um código secreto que fica salvo no aparelho. É ele que libera o acompanhamento em tempo real e a avaliação, uma vez só, depois da entrega.
- **Favoritos:** ficam salvos no próprio aparelho.
- Se trocar de celular ou limpar o navegador, os pedidos antigos somem da lista (o restaurante continua vendo tudo no painel).

**Contas de cliente:** existem só para o pagamento pelo site (uma conta por CPF). Para desligar contas e pagamento pelo site de uma vez, defina `CLIENTE_CONTAS=off`.

**Esqueci a senha (cliente):** a tela mostra o contato do suporte (`SUPORTE_WHATSAPP`/`SUPORTE_EMAIL`) e lembra que dá para pagar na entrega sem conta. Envio de link por e-mail fica para depois.

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

ChefOnline:
- `GET /api/vitrine`: restaurantes, pratos e avaliações recentes.
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
- Ligar uma empresa de pagamento real (cartão e Pix online), com webhook de confirmação e estorno quando o dono cancela um pedido já pago.
- "Esqueci minha senha" por e-mail para as contas de cliente.
- Endereços salvos na conta de cliente.
- Mais proteções anti-trote: ver `IDEIAS-ANTITROTE.md`.
- Aviso do status do pedido pelo WhatsApp do cliente.
- Escolher opções e adicionais dos pratos dentro do ChefOnline (hoje vai a opção padrão; no link próprio do restaurante já dá para escolher).
