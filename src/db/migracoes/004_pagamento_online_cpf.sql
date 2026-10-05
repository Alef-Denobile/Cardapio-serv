-- Pagamento pelo site (entrega com conta de cliente) e CPF para entrega paga na porta (contra trote)

-- nova forma de pagamento: "online" (cartão ou Pix pelo site, via empresa de pagamento)
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_pag_metodo_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_pag_metodo_check CHECK (pag_metodo IN ('pix', 'cartao', 'dinheiro', 'local', 'online'));

-- novo estado: o pedido pago pelo site só chega à cozinha depois que o pagamento é aprovado
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check CHECK (status IN ('aguardando', 'novo', 'preparo', 'pronto', 'rota', 'entregue', 'cancelado'));

ALTER TABLE pedidos
  ADD COLUMN cliente_cpf text CHECK (cliente_cpf ~ '^\d{11}$'),     -- só números; exigido na entrega paga na porta
  ADD COLUMN pag_status text CHECK (pag_status IN ('pendente', 'aprovado', 'recusado')),  -- só para pagamento pelo site
  ADD COLUMN pag_ref text;                                          -- código da cobrança na empresa de pagamento

CREATE INDEX pedidos_aguardando ON pedidos (criado_em) WHERE status = 'aguardando';

-- função que os devs ligam/desligam por restaurante
ALTER TABLE restaurantes ADD COLUMN rec_online boolean NOT NULL DEFAULT true;

-- contas de cliente (só para quem paga a entrega pelo site): CPF obrigatório e uma conta por CPF
ALTER TABLE clientes ADD COLUMN cpf text CHECK (cpf ~ '^\d{11}$');
CREATE UNIQUE INDEX clientes_cpf ON clientes (cpf) WHERE cpf IS NOT NULL;
