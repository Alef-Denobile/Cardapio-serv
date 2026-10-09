#!/usr/bin/env bash
# ================================================================
# scripts/verificar.sh
# ================================================================
# Roda a mesma bateria de checagens que eu (Claude) rodo à mão antes
# de entregar qualquer alteração no painel. Não modifica nada — só
# avisa se algo está quebrado. Pode (e deve) rodar sempre que mexer
# em código, antes de dar commit ou gerar o pacote pra produção.
#
# O que ele confere, em ordem:
#   1. Sintaxe de todo arquivo .js do front-end (public/js) e do
#      back-end (server), com "node --check" — pega erro de digitação
#      (parêntese sobrando, vírgula faltando etc.) sem precisar abrir
#      o navegador nem o servidor.
#   2. Chaves { } batendo no style.css — um { ou } a mais/a menos
#      quebra o CSS inteiro silenciosamente.
#   3. <div> abrindo e fechando em número igual no index.html e no
#      login.html — a mesma ideia, mas pra HTML.
#   4. Todo data-action="..." usado em algum botão do script.js tem
#      um binding (querySelector) em algum lugar — ver
#      scripts/verificar-bindings.js.
#   5. Os testes automatizados do back-end (server/test/*.test.js),
#      com "node --test".
#
# Uso:
#   bash scripts/verificar.sh
#
# Sai com código 0 se tudo passar, ou código 1 (e mostra o que falhou)
# caso contrário — assim dá pra usar em CI ou como pre-commit hook
# também, se quiser.
# ================================================================

set -uo pipefail

# raiz do projeto = uma pasta acima de scripts/, não importa de onde
# o script foi chamado
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

FALHOU=0
total_passos=0
passos_ok=0

# Se nunca rodou "npm install" na pasta server/, os testes do passo 5 vão
# falhar com uma mensagem confusa de "módulo não encontrado". Avisa antes.
if [ ! -d "server/node_modules" ]; then
  echo "⚠ Não encontrei server/node_modules — rode 'cd server && npm install' primeiro."
  echo "  (continuando mesmo assim, mas o passo de testes provavelmente vai falhar)"
fi

passo() {
  # imprime o título de um passo
  echo ""
  echo "── $1 ──────────────────────────────────────────────"
}

ok() {
  echo "✔ $1"
  passos_ok=$((passos_ok + 1))
}

falhou() {
  echo "✘ $1"
  FALHOU=1
}

contar() {
  total_passos=$((total_passos + 1))
}

# ---------------------------------------------------------------
# 1) Sintaxe JS (node --check) — front-end
# ---------------------------------------------------------------
passo "1/5 — Sintaxe do JavaScript do front-end"
for arquivo in public/js/*.js; do
  contar
  if node --check "$arquivo" 2>/tmp/erro-sintaxe.txt; then
    ok "$arquivo"
  else
    falhou "$arquivo — erro de sintaxe:"
    cat /tmp/erro-sintaxe.txt
  fi
done

# ---------------------------------------------------------------
# 1b) Sintaxe JS (node --check) — back-end (ignora node_modules)
# ---------------------------------------------------------------
passo "2/5 — Sintaxe do JavaScript do back-end"
while IFS= read -r -d '' arquivo; do
  contar
  if node --check "$arquivo" 2>/tmp/erro-sintaxe.txt; then
    ok "$arquivo"
  else
    falhou "$arquivo — erro de sintaxe:"
    cat /tmp/erro-sintaxe.txt
  fi
done < <(find server -name "*.js" -not -path "*/node_modules/*" -print0)

# ---------------------------------------------------------------
# 2) Chaves { } batendo no CSS
# ---------------------------------------------------------------
passo "3/5 — Chaves { } do style.css"
contar
abre=$(grep -o "{" public/css/style.css | wc -l)
fecha=$(grep -o "}" public/css/style.css | wc -l)
if [ "$abre" -eq "$fecha" ]; then
  ok "style.css — $abre abrindo, $fecha fechando"
else
  falhou "style.css — $abre chave(s) abrindo, mas $fecha fechando (deveria ser igual)"
fi

# ---------------------------------------------------------------
# 3) <div> abrindo/fechando em número igual (index.html e login.html)
# ---------------------------------------------------------------
passo "4/5 — <div> do HTML"
for arquivo in public/index.html public/login.html; do
  contar
  abre=$(grep -o "<div" "$arquivo" | wc -l)
  fecha=$(grep -o "</div>" "$arquivo" | wc -l)
  if [ "$abre" -eq "$fecha" ]; then
    ok "$arquivo — $abre <div> abrindo, $fecha </div> fechando"
  else
    falhou "$arquivo — $abre <div> abrindo, mas $fecha </div> fechando (deveria ser igual)"
  fi
done

# ---------------------------------------------------------------
# 4) Cobertura dos data-action (binding)
# ---------------------------------------------------------------
passo "5/5 — Cobertura dos data-action (script.js)"
contar
if node scripts/verificar-bindings.js; then
  ok "data-action com binding"
else
  falhou "data-action sem binding (ver detalhes acima)"
fi

# ---------------------------------------------------------------
# 5) Testes automatizados do back-end
# ---------------------------------------------------------------
passo "Testes automatizados do back-end (node --test)"
contar
if (cd server && node --test 2>&1 | tee /tmp/resultado-testes.txt | tail -20); then
  if grep -q "^# fail 0$" /tmp/resultado-testes.txt; then
    ok "testes do back-end"
  else
    falhou "testes do back-end — tem teste falhando (ver saída acima)"
  fi
else
  falhou "testes do back-end — não rodou (ver saída acima)"
fi

# ---------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════════════════════"
if [ "$FALHOU" -eq 0 ]; then
  echo "✔ TUDO CERTO — $passos_ok/$total_passos checagens passaram."
  echo "════════════════════════════════════════════════════════════"
  exit 0
else
  echo "✘ ALGO FALHOU — $passos_ok/$total_passos checagens passaram."
  echo "  Corrija o que está marcado com ✘ acima antes de gerar o pacote."
  echo "════════════════════════════════════════════════════════════"
  exit 1
fi
