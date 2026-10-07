-- Pacote de operação: "peça também", conta da mesa, fotos enviadas pelo painel, pedido agendado,
-- taxa por distância, estoque com ficha técnica, NFC-e e modo totem.

-- 1) "Peça também": o dono escolhe quais produtos sugerir no carrinho
ALTER TABLE produtos ADD COLUMN sugerir boolean NOT NULL DEFAULT false;

-- 2) Conta da mesa: como o cliente quer pagar, em quantas pessoas divide e o valor na hora do pedido
ALTER TABLE chamados
  ADD COLUMN pagamento text NOT NULL DEFAULT '' CHECK (pagamento IN ('', 'pix', 'cartao', 'dinheiro')),
  ADD COLUMN pessoas integer NOT NULL DEFAULT 1 CHECK (pessoas BETWEEN 1 AND 30),
  ADD COLUMN total numeric(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  ADD COLUMN atendido_em timestamptz;

-- 3) Fotos enviadas pelo painel (ficam no banco: o disco do servidor gratuito é apagado a cada deploy)
CREATE TABLE fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp')),
  dados bytea NOT NULL,
  tamanho integer NOT NULL CHECK (tamanho BETWEEN 1 AND 3145728),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fotos_restaurante ON fotos (restaurante_id, criado_em);

-- 4) Pedido agendado (opcional: o dono liga nas configurações)
ALTER TABLE restaurantes
  ADD COLUMN agendar_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN agendar_antecedencia integer NOT NULL DEFAULT 60 CHECK (agendar_antecedencia BETWEEN 15 AND 1440),
  ADD COLUMN agendar_dias integer NOT NULL DEFAULT 2 CHECK (agendar_dias BETWEEN 0 AND 7),
  ADD COLUMN agendar_preparo integer NOT NULL DEFAULT 45 CHECK (agendar_preparo BETWEEN 10 AND 240);
ALTER TABLE pedidos ADD COLUMN agendado_para timestamptz;
CREATE INDEX pedidos_agendados ON pedidos (restaurante_id, agendado_para) WHERE agendado_para IS NOT NULL;

-- 5) Taxa de entrega por distância (além da taxa por bairro)
ALTER TABLE restaurantes
  ADD COLUMN entrega_modo text NOT NULL DEFAULT 'bairro' CHECK (entrega_modo IN ('bairro', 'distancia')),
  ADD COLUMN local_lat double precision CHECK (local_lat BETWEEN -90 AND 90),
  ADD COLUMN local_lng double precision CHECK (local_lng BETWEEN -180 AND 180),
  ADD COLUMN local_endereco text NOT NULL DEFAULT '',
  ADD COLUMN faixas_km jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(faixas_km) = 'array');
ALTER TABLE pedidos
  ADD COLUMN entrega_lat double precision,
  ADD COLUMN entrega_lng double precision,
  ADD COLUMN entrega_km numeric(6,2);

-- 6) Estoque e ficha técnica
CREATE TABLE insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  unidade text NOT NULL DEFAULT 'un' CHECK (unidade IN ('un', 'kg', 'g', 'l', 'ml')),
  estoque numeric(12,3) NOT NULL DEFAULT 0,
  minimo numeric(12,3) NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  custo numeric(12,4) NOT NULL DEFAULT 0 CHECK (custo >= 0),          -- R$ por unidade (por kg, por litro, por unidade...)
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, nome),
  UNIQUE (id, restaurante_id)
);
CREATE TRIGGER insumos_atualizado BEFORE UPDATE ON insumos FOR EACH ROW EXECUTE FUNCTION tocar_atualizado();

CREATE TABLE ficha_tecnica (
  restaurante_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  qtd numeric(12,3) NOT NULL CHECK (qtd > 0),
  PRIMARY KEY (produto_id, insumo_id),
  FOREIGN KEY (produto_id, restaurante_id) REFERENCES produtos (id, restaurante_id) ON DELETE CASCADE,
  FOREIGN KEY (insumo_id, restaurante_id) REFERENCES insumos (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX ficha_insumo ON ficha_tecnica (insumo_id);

CREATE TABLE estoque_mov (
  id bigserial PRIMARY KEY,
  restaurante_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  delta numeric(12,3) NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('venda', 'devolucao', 'entrada', 'ajuste', 'perda')),
  pedido_id uuid,
  por text NOT NULL DEFAULT '',
  em timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (insumo_id, restaurante_id) REFERENCES insumos (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX estoque_mov_insumo ON estoque_mov (insumo_id, em DESC);
CREATE INDEX estoque_mov_pedido ON estoque_mov (pedido_id) WHERE pedido_id IS NOT NULL;

-- custo de cada item na hora da venda (pela ficha técnica), para o lucro por prato
ALTER TABLE pedido_itens ADD COLUMN custo numeric(12,4);

-- 7) NFC-e (nota fiscal do consumidor), por um emissor autorizado
ALTER TABLE restaurantes
  ADD COLUMN rec_nfce boolean NOT NULL DEFAULT false,
  ADD COLUMN fiscal jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(fiscal) = 'object'),
  ADD COLUMN fiscal_token text NOT NULL DEFAULT '';
ALTER TABLE produtos ADD COLUMN fiscal jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(fiscal) = 'object');

CREATE TABLE notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  ref text NOT NULL,
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao', 'demo')),
  status text NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'autorizada', 'erro', 'cancelada')),
  numero integer,
  serie integer,
  chave text,
  url_danfe text,
  url_xml text,
  mensagem text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  pagamento text NOT NULL DEFAULT '',
  cpf text CHECK (cpf ~ '^\d{11}$'),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, ref),
  FOREIGN KEY (pedido_id, restaurante_id) REFERENCES pedidos (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX notas_pedido ON notas_fiscais (pedido_id);
CREATE TRIGGER notas_atualizado BEFORE UPDATE ON notas_fiscais FOR EACH ROW EXECUTE FUNCTION tocar_atualizado();

-- 8) Modo totem (autoatendimento no balcão)
ALTER TABLE restaurantes
  ADD COLUMN rec_totem boolean NOT NULL DEFAULT true,
  ADD COLUMN totem_token text;
ALTER TABLE pedidos
  ADD COLUMN origem text NOT NULL DEFAULT 'site' CHECK (origem IN ('site', 'mesa', 'totem')),
  ADD COLUMN consumo text CHECK (consumo IN ('local', 'viagem'));

-- Row Level Security nas tabelas novas
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fotos', 'insumos', 'ficha_tecnica', 'estoque_mov', 'notas_fiscais'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY isolamento ON %I USING (app_sistema() OR restaurante_id = app_restaurante()) WITH CHECK (app_sistema() OR restaurante_id = app_restaurante())', t);
  END LOOP;
END $$;
