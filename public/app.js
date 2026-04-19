const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const locateBtn = document.getElementById('locateBtn');
const radiusSelect = document.getElementById('radiusSelect');
const statusFilter = document.getElementById('statusFilter');
const cardTemplate = document.getElementById('cardTemplate');
const dialog = document.getElementById('detailDialog');
const dialogTitle = document.getElementById('dialogTitle');
const dialogBody = document.getElementById('dialogBody');

let map = L.map('map');
let currentMarker = null;
let resultLayer = L.layerGroup().addTo(map);
let allItems = [];

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
map.setView([50.0755, 14.4378], 13);

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function factRow(label, value) {
  if (!value) return '';
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function renderResults() {
  const filter = statusFilter.value;
  const items = filter === 'all' ? allItems : allItems.filter((item) => item.status === filter);
  resultsEl.innerHTML = '';
  resultLayer.clearLayers();

  if (!items.length) {
    resultsEl.innerHTML = '<div class="card">Nic se nenašlo pro zvolený filtr.</div>';
    return;
  }

  const bounds = [];
  for (const item of items) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('.name').textContent = item.name;
    card.querySelector('.meta').textContent = `${item.status} • ${item.distanceKm} km`;
    card.querySelector('.summary').textContent = item.address || 'Adresa není k dispozici.';
    card.querySelector('.facts').innerHTML = [
      factRow('Postaveno', item.yearBuilt),
      factRow('Architekt', item.architect),
      factRow('Dnes', item.currentUse)
    ].join('');
    card.querySelector('.detail-btn').addEventListener('click', () => openDetail(item));
    resultsEl.appendChild(card);

    const marker = L.marker([item.lat, item.lon]).addTo(resultLayer);
    marker.bindPopup(`<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.status)}`);
    marker.on('click', () => openDetail(item));
    bounds.push([item.lat, item.lon]);
  }

  if (currentMarker) {
    bounds.push(currentMarker.getLatLng());
  }
  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

async function openDetail(item) {
  dialogTitle.textContent = item.name;
  dialogBody.innerHTML = '<div class="detail-block">Načítám detail…</div>';
  dialog.showModal();

  const params = new URLSearchParams({
    wikidata: item.wikidata || '',
    wikipedia: item.wikipedia || '',
    yearBuilt: item.yearBuilt || '',
    architect: item.architect || '',
    currentUse: item.currentUse || '',
    name: item.name || '',
    status: item.status || ''
  });

  try {
    const res = await fetch(`/api/details?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba detailu');

    dialogBody.innerHTML = `
      <div class="detail-block">
        <span class="badge">${escapeHtml(data.status || item.status)}</span>
        ${item.distanceKm ? `<span class="badge">${escapeHtml(item.distanceKm)} km</span>` : ''}
        ${item.address ? `<p><strong>Adresa:</strong> ${escapeHtml(item.address)}</p>` : ''}
        ${data.summary ? `<p>${escapeHtml(data.summary)}</p>` : '<p>Stručný historický popis zatím není k dispozici.</p>'}
      </div>
      <div class="detail-block">
        <h3>Základní údaje</h3>
        <dl class="facts">
          ${factRow('Postaveno', data.yearBuilt || item.yearBuilt)}
          ${factRow('Architekt / stavitel', data.architect || item.architect)}
          ${factRow('Dnešní využití', data.currentUse || item.currentUse)}
          ${factRow('Wikidata', data.wikidata?.qid)}
        </dl>
      </div>
      <div class="detail-block">
        <h3>Zdroje</h3>
        <ul>
          ${data.wikidata?.wikipediaUrl ? `<li><a href="${escapeHtml(data.wikidata.wikipediaUrl)}" target="_blank" rel="noreferrer">Wikipedia</a></li>` : ''}
          ${item.wikidata ? `<li><a href="https://www.wikidata.org/wiki/${escapeHtml(item.wikidata)}" target="_blank" rel="noreferrer">Wikidata</a></li>` : ''}
          <li><a href="https://www.openstreetmap.org/${escapeHtml(item.osmType)}/${escapeHtml(item.osmId)}" target="_blank" rel="noreferrer">OpenStreetMap objekt</a></li>
        </ul>
      </div>
    `;
  } catch (error) {
    dialogBody.innerHTML = `<div class="detail-block">${escapeHtml(error.message)}</div>`;
  }
}

async function fetchNearby(position) {
  const { latitude, longitude } = position.coords;
  const radius = radiusSelect.value;

  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([latitude, longitude]).addTo(map).bindPopup('Jsi tady');

  setStatus('Hledám synagogy v okolí…');
  try {
    const res = await fetch(`/api/nearby?lat=${latitude}&lon=${longitude}&radius=${radius}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba při načítání.');
    allItems = data.items;
    setStatus(`Nalezeno ${data.count} objektů. Klepni na detail pro historii a zdroje.`);
    renderResults();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function locate() {
  if (!navigator.geolocation) {
    setStatus('Tento prohlížeč nepodporuje geolokaci.', true);
    return;
  }
  setStatus('Čekám na povolení polohy…');
  navigator.geolocation.getCurrentPosition(fetchNearby, (error) => {
    setStatus(`Nepodařilo se získat polohu: ${error.message}`, true);
  }, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 60000
  });
}

locateBtn.addEventListener('click', locate);
statusFilter.addEventListener('change', renderResults);
radiusSelect.addEventListener('change', () => {
  if (currentMarker) locate();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
