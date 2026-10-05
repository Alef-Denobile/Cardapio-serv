-- ChefOnline: vitrine com vários restaurantes, contas de cliente, avaliações e favoritos

ALTER TABLE restaurantes
  ADD COLUMN rec_vitrine boolean NOT NULL DEFAULT true,          -- aparece no ChefOnline (controlado pelos devs)
  ADD COLUMN categoria_vitrine text NOT NULL DEFAULT '',          -- ex.: Pizza, Hambúrguer
  ADD COLUMN capa_url text NOT NULL DEFAULT '',
  ADD COLUMN sobre text NOT NULL DEFAULT '';

-- Clientes são da plataforma (pedem em vários restaurantes com a mesma conta)
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  senha_hash text NOT NULL,
  telefone text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pedidos ADD COLUMN cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL;
CREATE INDEX pedidos_cliente ON pedidos (cliente_id, criado_em DESC) WHERE cliente_id IS NOT NULL;

CREATE TABLE avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  pedido_id uuid NOT NULL UNIQUE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text NOT NULL DEFAULT '' CHECK (length(comentario) <= 400),
  criado_em timestamptz NOT NULL DEFAULT now(),
  -- a avaliação é sempre de um pedido do mesmo restaurante
  FOREIGN KEY (pedido_id, restaurante_id) REFERENCES pedidos (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX avaliacoes_restaurante ON avaliacoes (restaurante_id, criado_em DESC);

CREATE TABLE favoritos (
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, restaurante_id)
);

-- Row Level Security
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY; ALTER TABLE clientes FORCE ROW LEVEL SECURITY;
CREATE POLICY so_sistema ON clientes USING (app_sistema()) WITH CHECK (app_sistema());
ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY; ALTER TABLE favoritos FORCE ROW LEVEL SECURITY;
CREATE POLICY so_sistema ON favoritos USING (app_sistema()) WITH CHECK (app_sistema());
ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY; ALTER TABLE avaliacoes FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento ON avaliacoes USING (app_sistema() OR restaurante_id = app_restaurante()) WITH CHECK (app_sistema() OR restaurante_id = app_restaurante());
