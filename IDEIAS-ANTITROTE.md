# Ideias contra pedido falso (trote)

Hoje o sistema já faz:
- **Entrega paga na porta pede CPF**, e o servidor confere se o número é válido.
- **Entrega paga no site exige conta** (uma conta por CPF) e só chega à cozinha depois do pagamento aprovado.
- Limite de 20 pedidos a cada 10 minutos por aparelho/rede.

Ideias para decidir depois, da mais simples para a mais forte:

| Ideia | Como funciona | Custo / esforço | Observação |
|---|---|---|---|
| Botão "Foi trote" no painel | O dono marca o pedido como trote. O CPF e o telefone ficam bloqueados para pagar na porta, em todos os restaurantes da plataforma. | Sem custo. Pouco trabalho. | A proteção que mais aprende com o tempo. Precisa de um jeito de desbloquear (área de devs), caso o dono marque errado. |
| Limite no primeiro pedido | Quem nunca pediu (CPF/telefone novo) só paga na porta até um valor máximo, por exemplo R$ 80. Acima disso, paga no site. | Sem custo. Pouco trabalho. | O valor pode ser configurado por restaurante. |
| Código por SMS ou WhatsApp | Antes de enviar o pedido, o cliente recebe um código no telefone e digita no site. | Alguns centavos por envio (Twilio, Zenvia, API oficial do WhatsApp). Trabalho médio. | A mais forte para quem paga na porta: o telefone precisa ser real e estar com a pessoa. Dá para pedir só no primeiro pedido de cada telefone. |
| Confirmação pelo restaurante | Pedido de cliente novo chega como "a confirmar" e o restaurante liga ou manda WhatsApp antes de preparar. | Sem custo. Pouco trabalho no sistema, mas dá trabalho para o restaurante. | Boa opção para restaurantes pequenos. |
| Pix antecipado para cliente novo | Cliente novo só pode pagar pelo site; o pagamento na porta libera depois do primeiro pedido entregue. | Depende da empresa de pagamento. | Ideal depois que o pagamento pelo site estiver ligado. |
| Lista de CPFs/telefones confiáveis | Clientes com vários pedidos entregues passam direto, sem nenhuma etapa extra. | Sem custo. | Combina bem com as outras: só o cliente novo ou suspeito passa pelas proteções. |

Cuidado com a LGPD: CPF e telefone são dados pessoais. Usar só para segurança dos pedidos, informar isso ao cliente (já aparece no site) e não compartilhar com terceiros.
