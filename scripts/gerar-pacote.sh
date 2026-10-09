#!/usr/bin/env bash
# ================================================================
# scripts/gerar-pacote.sh
# ================================================================
# Faz o processo completo que eu uso antes de entregar uma versão
# nova do painel:
#
#   1. Roda scripts/verificar.sh — se alguma checagem falhar, PARA
#      aqui e não gera pacote nenhum (passe --pular-verificacao pra
#      pular essa etapa, só em emergência).
#   2. Aumenta em 1 o número de cache-bust (o "?v=NNNNNNNN" no final
#      de style.css, script.js e login.js dentro do index.html e do
#      login.html) — isso obriga o navegador (e o app instalado no
#      celular) a baixar a versão nova em vez de usar a antiga que
#      ficou guardada em cache. Veja o aviso sobre cache no README.md.
#   3. Compacta o projeto inteiro num .zip, excluindo o que não deve
#      ir (.git, node_modules, .env com as senhas reais).
#   4. Descompacta esse .zip de novo numa pasta temporária, instala
#      as dependências do zero (npm install) e roda os testes de novo
#      — só pra ter certeza de que o .zip gerado está completo e
#      funcional, e não "esqueceu" nenhum arquivo.
#
# Uso:
#   bash scripts/gerar-pacote.sh
#   bash scripts/gerar-pacote.sh --pular-verificacao   # pula o passo 1
#
# O .zip final fica em: dist/crm-consorcio.zip
# ================================================================

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

PULAR_VERIFICACAO=0
for arg in "$@"; do
  if [ "$arg" = "--pular-verificacao" ]; then
    PULAR_VERIFICACAO=1
  fi
done

# ---------------------------------------------------------------
# 1) Verificação completa antes de empacotar
# ---------------------------------------------------------------
if [ "$PULAR_VERIFICACAO" -eq 1 ]; then
  echo "⚠ Pulando a verificação (--pular-verificacao) — não recomendado."
else
  echo "── Rodando scripts/verificar.sh antes de empacotar ──"
  if ! bash scripts/verificar.sh; then
    echo ""
    echo "✘ A verificação encontrou problema(s). O pacote NÃO foi gerado."
    echo "  Corrija o que foi apontado acima e rode de novo."
    exit 1
  fi
fi

# ---------------------------------------------------------------
# 2) Aumenta o número de cache-bust (?v=...) em 1
# ---------------------------------------------------------------
echo ""
echo "── Atualizando o número de versão (?v=...) ──"

VERSAO_ATUAL=$(grep -o '?v=[0-9]\+' public/index.html | head -1 | sed 's/?v=//')
if [ -z "$VERSAO_ATUAL" ]; then
  echo "✘ Não encontrei nenhum \"?v=NUMERO\" em public/index.html — abortando."
  exit 1
fi
VERSAO_NOVA=$((VERSAO_ATUAL + 1))

for arquivo in public/index.html public/login.html; do
  if [ -f "$arquivo" ]; then
    sed -i "s/?v=${VERSAO_ATUAL}/?v=${VERSAO_NOVA}/g" "$arquivo"
    echo "  $arquivo: ?v=${VERSAO_ATUAL} → ?v=${VERSAO_NOVA}"
  fi
done

echo "✔ Versão nova: ${VERSAO_NOVA}"

# ---------------------------------------------------------------
# 3) Gera o .zip (exclui .git, node_modules e .env)
# ---------------------------------------------------------------
echo ""
echo "── Gerando o .zip ──"

mkdir -p dist
ZIP_DESTINO="$RAIZ/dist/crm-consorcio.zip"
rm -f "$ZIP_DESTINO"

zip -r -q "$ZIP_DESTINO" . \
  -x ".git/*" \
  -x "*/node_modules/*" \
  -x "node_modules/*" \
  -x "server/.env" \
  -x ".env" \
  -x "dist/*"

QTD_ARQUIVOS=$(unzip -l "$ZIP_DESTINO" | tail -1 | awk '{print $2}')
echo "✔ Pacote gerado: $ZIP_DESTINO ($QTD_ARQUIVOS arquivos)"

# ---------------------------------------------------------------
# 4) Verifica o .zip a partir de uma extração nova e limpa
# ---------------------------------------------------------------
echo ""
echo "── Conferindo o .zip numa pasta limpa (extrai + npm install + testes) ──"

PASTA_TESTE=$(mktemp -d)
unzip -q "$ZIP_DESTINO" -d "$PASTA_TESTE"

( cd "$PASTA_TESTE/server" && npm install --silent --no-progress 2>&1 | tail -5 )
if (cd "$PASTA_TESTE/server" && node --test 2>&1 | tee /tmp/resultado-testes-zip.txt | tail -10) && grep -q "^# fail 0$" /tmp/resultado-testes-zip.txt; then
  echo "✔ Pacote confere: instala e passa nos testes a partir do zero."
  rm -rf "$PASTA_TESTE"
else
  echo "✘ Teste a partir do .zip falhou — NÃO confie nesse pacote, algo ficou de fora."
  echo "  Pasta de teste mantida em: $PASTA_TESTE (pra você investigar)"
  exit 1
fi

# ---------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════════════════════"
echo "✔ PACOTE PRONTO: $ZIP_DESTINO"
echo "  Versão (?v=...): $VERSAO_NOVA"
echo "════════════════════════════════════════════════════════════"
