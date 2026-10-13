-- Tipo do estabelecimento (lanchonete, sorveteria ou restaurante): ponto de partida ao criar
SELECT set_config('app.sistema', 'on', true);
ALTER TABLE restaurantes ADD COLUMN tipo text NOT NULL DEFAULT 'restaurante' CHECK (tipo IN ('lanchonete', 'sorveteria', 'restaurante'));
