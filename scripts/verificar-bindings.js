#!/usr/bin/env node
/* ================================================================
   Checagem de cobertura dos "data-action"
   ================================================================
   O painel usa um padrão de "event delegation": cada botão do HTML
   ganha um atributo data-action="algo-assim", e em algum lugar do
   script.js existe um document.querySelector('[data-action="algo-assim"]')
   (ou querySelectorAll) que liga o clique de verdade.

   É fácil esquecer de ligar o binding de um botão novo (o botão aparece
   na tela, mas clicar nele não faz nada). Esse script varre o
   script.js inteiro, pega todo data-action="valor-fixo" usado dentro
   de um template (string), e confere se aquele mesmo valor aparece
   em algum querySelector/querySelectorAll — ou seja, se foi ligado.

   Isso NÃO substitui testar o botão na tela, mas pega o erro mais
   comum (botão sem binding nenhum) antes de mandar pro usuário.

   Uso:
     node scripts/verificar-bindings.js [caminho-do-script.js]
   Sai com código 1 se achar algum data-action sem binding.
================================================================ */

const fs = require('fs');
const path = require('path');

const alvo = process.argv[2] || path.join(__dirname, '..', 'public', 'js', 'script.js');
const codigo = fs.readFileSync(alvo, 'utf8');

// 1) todo data-action="valor-fixo" (ignora os que usam ${...} dinâmico,
//    esses não dá pra conferir por string fixa)
const regexDefinicao = /data-action="([a-zA-Z0-9_-]+)"/g;
const definidos = new Set();
let m;
while ((m = regexDefinicao.exec(codigo))) {
  definidos.add(m[1]);
}

// 2) todo data-action que aparece dentro de um querySelector/querySelectorAll
//    (é aqui que o binding de verdade acontece)
const regexBinding = /querySelector(?:All)?\([^)]*data-action="([a-zA-Z0-9_-]+)"/g;
const ligados = new Set();
while ((m = regexBinding.exec(codigo))) {
  ligados.add(m[1]);
}

const semBinding = [...definidos].filter((acao) => !ligados.has(acao)).sort();

if (semBinding.length === 0) {
  console.log(`✔ Todos os ${definidos.size} data-action encontrados em ${path.basename(alvo)} têm binding (querySelector) em algum lugar.`);
  process.exit(0);
}

console.error(`✘ ${semBinding.length} data-action SEM binding encontrado em ${path.basename(alvo)}:`);
semBinding.forEach((acao) => console.error(`   - data-action="${acao}"`));
console.error('\nIsso quer dizer que o botão existe na tela mas (provavelmente) clicar nele não faz nada.');
console.error('Pode ser um falso positivo se o binding usa outro jeito de selecionar (ex: closest() com outra lógica)');
console.error('— nesse caso confira manualmente antes de se preocupar.');
process.exit(1);
