-- Premissas do balanço financeiro (o dono ajusta no painel) e índice para o mapa das mesas
ALTER TABLE restaurantes
  ADD COLUMN fin_cmv numeric(5,2) NOT NULL DEFAULT 32 CHECK (fin_cmv BETWEEN 0 AND 100),
  ADD COLUMN fin_cartao numeric(5,2) NOT NULL DEFAULT 3.2 CHECK (fin_cartao BETWEEN 0 AND 20),
  ADD COLUMN fin_pix numeric(5,2) NOT NULL DEFAULT 0.99 CHECK (fin_pix BETWEEN 0 AND 20),
  ADD COLUMN fin_repasse numeric(5,2) NOT NULL DEFAULT 100 CHECK (fin_repasse BETWEEN 0 AND 100),
  ADD COLUMN fin_embalagem numeric(10,2) NOT NULL DEFAULT 2.5 CHECK (fin_embalagem >= 0),
  ADD COLUMN fin_entrega numeric(10,2) NOT NULL DEFAULT 7 CHECK (fin_entrega >= 0);

CREATE INDEX pedidos_restaurante_mesa ON pedidos (restaurante_id, mesa) WHERE tipo = 'mesa';
