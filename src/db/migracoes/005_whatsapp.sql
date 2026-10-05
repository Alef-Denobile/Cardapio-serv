-- Avisos automáticos pelo WhatsApp (API oficial). Cada mensagem tem custo, então vem desligado e os devs ligam por restaurante.
ALTER TABLE restaurantes ADD COLUMN rec_whatsapp boolean NOT NULL DEFAULT false;
