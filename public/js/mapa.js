/* Mapa (Leaflet + OpenStreetMap) para marcar o local da entrega e o endereço do restaurante.
   O Leaflet é carregado só quando um mapa aparece na tela, a partir do próprio servidor (/vendor/leaflet). */
(function (w) {
  'use strict';
  let carregando = null;
  function carregar() {
    if (w.L) return Promise.resolve(w.L);
    if (carregando) return carregando;
    carregando = new Promise((ok, erro) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = () => ok(w.L); s.onerror = () => { carregando = null; erro(new Error('Não foi possível carregar o mapa.')); };
      document.head.appendChild(s);
    });
    return carregando;
  }
  // Distância em linha reta (km), a mesma conta que o servidor faz
  function km(a, b) {
    const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // el: elemento; o: { centro:{lat,lng}, ponto:{lat,lng}|null, zoom, restaurante:{lat,lng}|null, aoMover(lat,lng), raioKm }
  async function criar(el, o) {
    const L = await carregar();
    if (!el.isConnected) return null;
    if (el._mapa) { el._mapa.remove(); el._mapa = null; }
    const centro = o.ponto || o.centro || { lat: -15.78, lng: -47.93 };
    const m = L.map(el, { scrollWheelZoom: false, tap: true }).setView([centro.lat, centro.lng], o.zoom || (o.ponto || o.centro ? 15 : 4));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
    if (o.restaurante) {
      L.circleMarker([o.restaurante.lat, o.restaurante.lng], { radius: 8, color: '#fff', weight: 3, fillColor: getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#D23F3F', fillOpacity: 1 }).addTo(m).bindTooltip('Restaurante');
      if (o.raioKm) L.circle([o.restaurante.lat, o.restaurante.lng], { radius: o.raioKm * 1000, color: '#D23F3F', weight: 1, fillOpacity: .04, interactive: false }).addTo(m);
    }
    let pino = null;
    const colocar = (lat, lng, avisar) => {
      if (!pino) { pino = L.marker([lat, lng], { draggable: true, autoPan: true, keyboard: true, title: 'Arraste até o local certo' }).addTo(m); pino.on('dragend', () => { const p = pino.getLatLng(); o.aoMover && o.aoMover(p.lat, p.lng, m.getZoom()); }); }
      else pino.setLatLng([lat, lng]);
      if (avisar && o.aoMover) o.aoMover(lat, lng, m.getZoom());
    };
    if (o.ponto) colocar(o.ponto.lat, o.ponto.lng, false);
    m.on('click', e => colocar(e.latlng.lat, e.latlng.lng, true)); // tocar no mapa também marca o local
    el._mapa = m;
    setTimeout(() => m.invalidateSize(), 60);
    return m;
  }
  w.Mapa = { carregar, criar, km };
})(window);
