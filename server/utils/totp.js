const crypto = require('crypto');

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += ALFABETO_BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALFABETO_BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const cleaned = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = ALFABETO_BASE32.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function gerarSegredo() {
  return base32Encode(crypto.randomBytes(20));
}

function gerarCodigoTOTP(secretBase32, timeStepSegundos, paraTempoMs) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(paraTempoMs / 1000 / timeStepSegundos);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (codeInt % 1000000).toString().padStart(6, '0');
}

// Aceita o código atual e uma pequena janela pra frente/trás, pra tolerar
// diferença de relógio entre o celular e o servidor.
function verificarCodigoTOTP(secretBase32, codigo, janelaPassos) {
  if (!codigo || !/^\d{6}$/.test(String(codigo).trim())) return false;
  const janela = typeof janelaPassos === 'number' ? janelaPassos : 1;
  const agora = Date.now();
  for (let i = -janela; i <= janela; i++) {
    const esperado = gerarCodigoTOTP(secretBase32, 30, agora + i * 30 * 1000);
    if (esperado === String(codigo).trim()) return true;
  }
  return false;
}

function montarOtpAuthUri(secretBase32, contaLabel, emissor) {
  const label = encodeURIComponent(`${emissor}:${contaLabel}`);
  const params = `secret=${secretBase32}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
  return `otpauth://totp/${label}?${params}`;
}

module.exports = { gerarSegredo, gerarCodigoTOTP, verificarCodigoTOTP, montarOtpAuthUri };
