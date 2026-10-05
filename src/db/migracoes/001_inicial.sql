-- Esquema inicial do Cardápio Digital (PostgreSQL 15 ou mais novo)
-- Isolamento entre restaurantes em duas camadas:
--   1) toda tabela de restaurante tem restaurante_id, com chaves que impedem misturar dados;
--   2) Row Level Security: o próprio banco só devolve linhas do restaurante da sessão.

-- Contexto da sessão (definido pelo servidor a cada transação)
CREATE OR REPLACE FUNCTION app_restaurante() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.restaurante_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_sistema() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.sistema', true), '') = 'on' $$;

CREATE OR REPLACE FUNCTION tocar_atualizado() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.atualizado_em = now(); RETURN NEW; END $$;

-- Restaurantes -------------------------------------------------------------
CREATE TABLE restaurantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  frase text NOT NULL DEFAULT '',
  cor text NOT NULL DEFAULT '#2F5D46' CHECK (cor ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  chave_pix text NOT NULL DEFAULT '',
  fuso text NOT NULL DEFAULT 'America/Sao_Paulo',
  abre text NOT NULL DEFAULT '11:00' CHECK (abre ~ '^\d{2}:\d{2}$'),
  fecha text NOT NULL DEFAULT '23:00' CHECK (fecha ~ '^\d{2}:\d{2}$'),
  aceitar_fora_horario boolean NOT NULL DEFAULT false,
  taxa_servico numeric(5,2) NOT NULL DEFAULT 10 CHECK (taxa_servico BETWEEN 0 AND 30),
  categorias text[] NOT NULL DEFAULT '{}',
  delivery_ativo boolean NOT NULL DEFAULT true,
  delivery_tempo text NOT NULL DEFAULT '40–50 min',
  retirada_tempo text NOT NULL DEFAULT '20–30 min',
  pedido_minimo numeric(10,2) NOT NULL DEFAULT 0 CHECK (pedido_minimo >= 0),
  gratis_acima_de numeric(10,2) NOT NULL DEFAULT 0 CHECK (gratis_acima_de >= 0),
  seq_pedido integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  -- controlado só pela área de devs
  rec_mesa boolean NOT NULL DEFAULT true,
  rec_chamados boolean NOT NULL DEFAULT true,
  rec_retirada boolean NOT NULL DEFAULT true,
  rec_delivery boolean NOT NULL DEFAULT true,
  rec_pix boolean NOT NULL DEFAULT true,
  rec_cartao boolean NOT NULL DEFAULT true,
  rec_dinheiro boolean NOT NULL DEFAULT true,
  plano text NOT NULL DEFAULT 'Básico',
  observacoes text NOT NULL DEFAULT '',
  motivo_suspensao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER restaurantes_atualizado BEFORE UPDATE ON restaurantes FOR EACH ROW EXECUTE FUNCTION tocar_atualizado();

CREATE TABLE bairros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  taxa numeric(10,2) NOT NULL DEFAULT 0 CHECK (taxa >= 0),
  ordem integer NOT NULL DEFAULT 0,
  UNIQUE (restaurante_id, nome)
);

-- Pessoas ------------------------------------------------------------------
CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  senha_hash text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('dono', 'cozinha', 'entregador')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, restaurante_id)
);
CREATE INDEX usuarios_restaurante ON usuarios (restaurante_id);

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  senha_hash text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Cardápio -----------------------------------------------------------------
CREATE TABLE produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (length(categoria) BETWEEN 1 AND 60),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  descricao text NOT NULL DEFAULT '',
  preco numeric(10,2) NOT NULL CHECK (preco >= 0),
  selos text[] NOT NULL DEFAULT '{}',
  opcoes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(opcoes) = 'array'),
  foto_url text NOT NULL DEFAULT '',
  esgotado boolean NOT NULL DEFAULT false,
  destaque boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, restaurante_id)
);
CREATE INDEX produtos_restaurante ON produtos (restaurante_id, categoria, ordem);
CREATE TRIGGER produtos_atualizado BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION tocar_atualizado();

CREATE TABLE mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero BETWEEN 1 AND 999),
  token text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, numero)
);

-- Pedidos ------------------------------------------------------------------
CREATE TABLE pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('mesa', 'retirada', 'delivery')),
  mesa integer,
  cliente_nome text NOT NULL DEFAULT '',
  cliente_tel text NOT NULL DEFAULT '',
  entrega_endereco text,
  entrega_complemento text,
  entrega_referencia text,
  entrega_bairro text,
  obs text NOT NULL DEFAULT '',
  subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  servico numeric(10,2) NOT NULL DEFAULT 0 CHECK (servico >= 0),
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0 CHECK (taxa_entrega >= 0),
  total numeric(10,2) NOT NULL CHECK (total >= 0),
  pag_metodo text NOT NULL CHECK (pag_metodo IN ('pix', 'cartao', 'dinheiro', 'local')),
  pag_troco numeric(10,2) NOT NULL DEFAULT 0,
  pag_pago boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'preparo', 'pronto', 'rota', 'entregue', 'cancelado')),
  entregador_id uuid,
  entregador_nome text,
  codigo_acomp text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, numero),
  UNIQUE (id, restaurante_id),
  CHECK (tipo <> 'mesa' OR mesa IS NOT NULL),
  CHECK (tipo <> 'delivery' OR (entrega_endereco IS NOT NULL AND entrega_bairro IS NOT NULL)),
  CHECK (total = subtotal + servico + taxa_entrega),
  -- o entregador precisa ser do mesmo restaurante
  FOREIGN KEY (entregador_id, restaurante_id) REFERENCES usuarios (id, restaurante_id) ON DELETE SET NULL (entregador_id)
);
CREATE INDEX pedidos_restaurante_data ON pedidos (restaurante_id, criado_em DESC);
CREATE INDEX pedidos_restaurante_status ON pedidos (restaurante_id, status);
CREATE TRIGGER pedidos_atualizado BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION tocar_atualizado();

CREATE TABLE pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  restaurante_id uuid NOT NULL,
  produto_id uuid,
  nome text NOT NULL,
  qtd integer NOT NULL CHECK (qtd BETWEEN 1 AND 50),
  unit numeric(10,2) NOT NULL CHECK (unit >= 0),
  opcoes text[] NOT NULL DEFAULT '{}',
  ordem integer NOT NULL DEFAULT 0,
  FOREIGN KEY (pedido_id, restaurante_id) REFERENCES pedidos (id, restaurante_id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id, restaurante_id) REFERENCES produtos (id, restaurante_id) ON DELETE SET NULL (produto_id)
);
CREATE INDEX pedido_itens_pedido ON pedido_itens (pedido_id);
CREATE INDEX pedido_itens_produto ON pedido_itens (restaurante_id, produto_id);

CREATE TABLE pedido_historico (
  id bigserial PRIMARY KEY,
  pedido_id uuid NOT NULL,
  restaurante_id uuid NOT NULL,
  status text NOT NULL,
  por text NOT NULL DEFAULT '',
  em timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (pedido_id, restaurante_id) REFERENCES pedidos (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX pedido_historico_pedido ON pedido_historico (pedido_id);

CREATE TABLE chamados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mesa integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('garcom', 'conta')),
  atendido boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chamados_restaurante ON chamados (restaurante_id, atendido);

-- Histórico de alterações feitas pela equipe de devs ------------------------
CREATE TABLE auditoria (
  id bigserial PRIMARY KEY,
  restaurante_id uuid REFERENCES restaurantes(id) ON DELETE SET NULL,
  restaurante_nome text,
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  admin_nome text NOT NULL,
  acao text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_data ON auditoria (criado_em DESC);
CREATE INDEX auditoria_restaurante ON auditoria (restaurante_id, criado_em DESC);

-- Row Level Security ------------------------------------------------------
-- FORCE faz a regra valer também para o dono das tabelas (o usuário da aplicação).
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY; ALTER TABLE restaurantes FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento ON restaurantes USING (app_sistema() OR id = app_restaurante()) WITH CHECK (app_sistema() OR id = app_restaurante());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bairros', 'usuarios', 'produtos', 'mesas', 'pedidos', 'pedido_itens', 'pedido_historico', 'chamados'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY isolamento ON %I USING (app_sistema() OR restaurante_id = app_restaurante()) WITH CHECK (app_sistema() OR restaurante_id = app_restaurante())', t);
  END LOOP;
END $$;

ALTER TABLE admins ENABLE ROW LEVEL SECURITY; ALTER TABLE admins FORCE ROW LEVEL SECURITY;
CREATE POLICY so_sistema ON admins USING (app_sistema()) WITH CHECK (app_sistema());
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY; ALTER TABLE auditoria FORCE ROW LEVEL SECURITY;
CREATE POLICY so_sistema ON auditoria USING (app_sistema()) WITH CHECK (app_sistema());
