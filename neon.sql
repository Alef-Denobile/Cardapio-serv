-- Rode UMA vez no Neon: Console → SQL Editor (banco "neondb"), logado com o usuário dono.
-- Cria o usuário que o sistema usa. Ele NÃO é administrador do banco, então o isolamento
-- entre restaurantes (Row Level Security) vale de verdade.
-- Troque TROQUE-ESTA-SENHA por uma senha forte (só letras e números, para não complicar o endereço).

CREATE ROLE cardapio_app WITH LOGIN PASSWORD 'Restaurante-01';
GRANT CONNECT ON DATABASE neondb TO cardapio_app;
GRANT USAGE, CREATE ON SCHEMA public TO cardapio_app;

-- Endereço para colocar em DATABASE_URL (pegue o "host" no botão Connect do Neon, opção sem "pooled"):
-- postgresql://cardapio_app:TROQUE-ESTA-SENHA@ep-xxxx-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
