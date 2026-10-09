const CACHE_NAME = 'painel-crm-v2';

self.addEventListener('install', () => {
  self.skipWaiting(); // assume o controle assim que instalar, sem esperar todas as abas fecharem
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

// Estratégia: network-first pra tudo (menos chamadas de API, que nunca passam por
// aqui). Sempre tenta buscar a versão mais nova do servidor primeiro; só usa o que
// está guardado em cache se o celular estiver sem internet nesse momento. Isso
// garante que qualquer atualização do site aparece pra quem já instalou o "app" no
// celular, sem precisar desinstalar e instalar de novo — só abrir com internet.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // API sempre direto no servidor, nunca em cache

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});
