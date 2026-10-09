// Recuperação de carrinho (função extra "carrinho", desligada por padrão).
// Só para quem, no site do restaurante, informou o WhatsApp e MARCOU "me lembrar" (consentimento, LGPD).
// Se a pessoa não finalizar em X minutos (configurável pelo dono, padrão 30), recebe UMA mensagem no WhatsApp
// com um link que devolve o carrinho. Carrinhos são apagados depois de 7 dias.
const config = require('../config');
const { sistema } = require('../db');
const whatsapp = require('./whatsapp');
const { recursosDe } = require('./recursos');

const digitos = t => String(t || '').replace(/\D/g, '');

// Marca como finalizado quando a pessoa faz o pedido (pelo mesmo WhatsApp)
async function finalizar(c, rid, tel) {
  const d = digitos(tel); if (d.length < 10) return;
  await c.query("UPDATE carrinhos SET finalizado_em = now() WHERE restaurante_id = $1 AND tel = $2 AND finalizado_em IS NULL AND atualizado_em > now() - interval '7 days'", [rid, d]);
}

let rodando = false;
async function rotina() {
  if (rodando) return; rodando = true;
  try {
    const base = config.urlPublica || (config.producao ? '' : 'http://localhost:' + config.porta);
    // apaga os antigos (promessa do Aviso de privacidade)
    await sistema(c => c.query("DELETE FROM carrinhos WHERE criado_em < now() - interval '7 days'"));
    if (!config.whatsapp.provedor || !base) { rodando = false; return; }
    const lista = await sistema(async c => (await c.query(`SELECT k.*, r.nome AS rest_nome, r.slug, r.rec_carrinho, r.rec_whatsapp, r.ativo
      FROM carrinhos k JOIN restaurantes r ON r.id = k.restaurante_id
      WHERE k.lembrado_em IS NULL AND k.finalizado_em IS NULL AND r.rec_carrinho AND r.ativo
        AND k.atualizado_em < now() - make_interval(mins => r.carrinho_min) AND k.atualizado_em > now() - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM carrinhos o WHERE o.restaurante_id = k.restaurante_id AND o.tel = k.tel AND o.lembrado_em > now() - interval '7 days')
        -- limite por restaurante: no máximo 30 lembretes por hora (contra quem tenta usar o lembrete para mandar spam)
        AND (SELECT count(*) FROM carrinhos o WHERE o.restaurante_id = k.restaurante_id AND o.lembrado_em > now() - interval '1 hour') < 30
      ORDER BY k.atualizado_em LIMIT 50`)).rows);
    const porRest = new Map();
    for (const k of lista) {
      const n = porRest.get(k.restaurante_id) || 0; if (n >= 10) continue; porRest.set(k.restaurante_id, n + 1); // no máximo 10 por rodada (a cada 2 min)
      // marca antes de enviar: nunca manda duas vezes, mesmo se o envio der erro
      const ok = await sistema(async c => (await c.query('UPDATE carrinhos SET lembrado_em = now() WHERE id = $1 AND lembrado_em IS NULL', [k.id])).rowCount);
      if (!ok) continue;
      const link = base + '/r/' + encodeURIComponent(k.slug) + '?carrinho=' + encodeURIComponent(k.codigo);
      await whatsapp.lembrarCarrinho({ nome: k.rest_nome, recursos: { whatsapp: k.rec_whatsapp, carrinho: k.rec_carrinho } }, k, link);
    }
  } catch (e) { console.error('Lembrete de carrinho:', e.message); }
  rodando = false;
}
function iniciar() { setInterval(rotina, 2 * 60 * 1000).unref(); setTimeout(rotina, 8000).unref(); }

module.exports = { finalizar, rotina, iniciar, digitos, ligado: rest => recursosDe(rest).carrinho };
