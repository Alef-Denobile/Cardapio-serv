-- Número do pedido recomeça todo dia (001, 002…). Os pedidos continuam guardados no histórico do painel.
-- Também: pedido feito pelo menu do salão (retirar no balcão, sem telefone) e o novo vermelho padrão.
SELECT set_config('app.sistema', 'on', true); -- a migração precisa ver os pedidos de todos os restaurantes

ALTER TABLE pedidos ADD COLUMN dia date;
UPDATE pedidos p SET dia = (p.criado_em AT TIME ZONE r.fuso)::date FROM restaurantes r WHERE r.id = p.restaurante_id;
ALTER TABLE pedidos ALTER COLUMN dia SET NOT NULL;
ALTER TABLE pedidos DROP CONSTRAINT pedidos_restaurante_id_numero_key;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_numero_do_dia UNIQUE (restaurante_id, dia, numero);
CREATE INDEX pedidos_restaurante_dia ON pedidos (restaurante_id, dia);
ALTER TABLE restaurantes ADD COLUMN seq_dia date;

ALTER TABLE pedidos DROP CONSTRAINT pedidos_origem_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_origem_check CHECK (origem IN ('site', 'mesa', 'totem', 'salao'));

ALTER TABLE restaurantes ALTER COLUMN cor SET DEFAULT '#E30613';
UPDATE restaurantes SET cor = '#E30613' WHERE upper(cor) = '#D23F3F';
