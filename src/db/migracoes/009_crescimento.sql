-- Esqueci minha senha, Pix automático, mensalidade dos restaurantes, combos e meio a meio,
-- produtos por horário, recuperação de carrinho, importação de cardápio e domínio próprio.
SELECT set_config('app.sistema', 'on', true);

/* ---------- funções novas (os extras começam desligados) ---------- */
ALTER TABLE restaurantes
  ADD COLUMN rec_pixauto boolean NOT NULL DEFAULT true,     -- Pix com confirmação automática (só funciona depois que o dono liga a conta do Mercado Pago)
  ADD COLUMN rec_combos boolean NOT NULL DEFAULT false,     -- combos e pizza meio a meio
  ADD COLUMN rec_horarios boolean NOT NULL DEFAULT false,   -- produtos por horário
  ADD COLUMN rec_carrinho boolean NOT NULL DEFAULT false,   -- lembrete de carrinho abandonado no WhatsApp
  ADD COLUMN rec_dominio boolean NOT NULL DEFAULT false;    -- domínio próprio (plano mais caro)

/* ---------- esqueci minha senha ---------- */
CREATE TABLE senha_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('usuario', 'cliente')),
  conta_id uuid NOT NULL,
  hash text NOT NULL UNIQUE,            -- só o hash do código vai para o banco
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX senha_tokens_conta ON senha_tokens (tipo, conta_id, criado_em);
ALTER TABLE senha_tokens ENABLE ROW LEVEL SECURITY; ALTER TABLE senha_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY so_sistema ON senha_tokens USING (app_sistema()) WITH CHECK (app_sistema());

-- trocar a senha encerra os acessos que estavam abertos em outros aparelhos
ALTER TABLE usuarios ADD COLUMN senha_alterada_em timestamptz;
ALTER TABLE clientes ADD COLUMN senha_alterada_em timestamptz;

/* ---------- termos e privacidade ---------- */
ALTER TABLE clientes ADD COLUMN termos_em timestamptz;   -- quando o cliente aceitou os termos (contas novas)

/* ---------- Pix automático (conta do próprio restaurante no Mercado Pago) ---------- */
ALTER TABLE restaurantes
  ADD COLUMN pix_auto jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { ativo, provedor: 'mercadopago' | 'demo' }
  ADD COLUMN pix_token text,                               -- token de acesso do Mercado Pago (nunca volta para a tela)
  ADD COLUMN pix_segredo text,                             -- assinatura secreta do webhook (opcional)
  ADD COLUMN pix_chave_webhook text;                       -- parte aleatória do endereço do webhook
ALTER TABLE pedidos
  ADD COLUMN pix_qr text,                                  -- Pix copia e cola gerado para este pedido
  ADD COLUMN pix_expira timestamptz;
CREATE INDEX pedidos_pix_pendente ON pedidos (criado_em) WHERE status = 'aguardando' AND pag_metodo = 'pix';

/* ---------- mensalidade dos restaurantes ---------- */
ALTER TABLE restaurantes
  ADD COLUMN cobranca jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { ativa, valor, dia, tolerancia }
  ADD COLUMN suspenso_cobranca boolean NOT NULL DEFAULT false; -- suspenso automaticamente por atraso (volta sozinho quando paga)
CREATE TABLE faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  competencia date NOT NULL,             -- primeiro dia do mês cobrado
  valor numeric(10,2) NOT NULL CHECK (valor >= 0),
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada')),
  pago_em timestamptz,
  forma text,                            -- pix, manual (dinheiro, transferência...)
  obs text NOT NULL DEFAULT '',
  pix_ref text, pix_qr text, pix_expira timestamptz,
  codigo text NOT NULL,                  -- vai no link de pagamento enviado ao dono (funciona mesmo com o painel suspenso)
  avisada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, competencia)
);
CREATE INDEX faturas_abertas ON faturas (vencimento) WHERE status = 'aberta';

/* ---------- combos, meio a meio e horários ---------- */
ALTER TABLE produtos ADD COLUMN disponibilidade jsonb;   -- { dias: [0..6], de: 'HH:MM', ate: 'HH:MM' } ou null = sempre

/* ---------- recuperação de carrinho ---------- */
ALTER TABLE restaurantes ADD COLUMN carrinho_min integer NOT NULL DEFAULT 30 CHECK (carrinho_min BETWEEN 10 AND 720);
CREATE TABLE carrinhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  codigo text NOT NULL UNIQUE,           -- vai no link do lembrete para restaurar o carrinho
  nome text NOT NULL DEFAULT '',
  tel text NOT NULL,
  itens jsonb NOT NULL,
  total numeric(10,2) NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  lembrado_em timestamptz,
  finalizado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carrinhos_pendentes ON carrinhos (atualizado_em) WHERE lembrado_em IS NULL AND finalizado_em IS NULL;
CREATE UNIQUE INDEX carrinhos_tel ON carrinhos (restaurante_id, tel) WHERE lembrado_em IS NULL AND finalizado_em IS NULL;

/* ---------- domínio próprio ---------- */
ALTER TABLE restaurantes ADD COLUMN dominio text CHECK (dominio ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');
CREATE UNIQUE INDEX restaurantes_dominio ON restaurantes (dominio) WHERE dominio IS NOT NULL;

/* ---------- Row Level Security nas tabelas novas ---------- */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['faturas', 'carrinhos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY isolamento ON %I USING (app_sistema() OR restaurante_id = app_restaurante()) WITH CHECK (app_sistema() OR restaurante_id = app_restaurante())', t);
  END LOOP;
END $$;
