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

map.setView([50.0755, 14.4378], 8);

function setStatus(message, isError = false) {
  statusEl.textContent = message;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function factRow(label, value) {
  if (!value) return '';
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function loadSynagogues() {
  const res = await fetch('/stredni_cechy_dataset_v2.json');
  const data = await res.json();
  return data.records || [];
}

function openDetail(item) {
  dialogTitle.textContent = item.name;

  dialogBody.innerHTML = `
    <div>
      <b>${escapeHtml(item.name)}</b><br>
      ${escapeHtml(item.description_short || '')}<br><br>

      ${item.address ? `<b>Adresa:</b> ${escapeHtml(item.address)}<br>` : ''}
      ${item.current_use ? `<b>Dnes:</b> ${escapeHtml(item.current_use)}<br>` : ''}
      ${item.year_built ? `<b>Postaveno:</b> ${item.year_built}<br>` : ''}
    </div>
  `;

  dialog.showModal();
}

function renderResults() {
  const filter = statusFilter.value;
  const items = filter === 'all'
    ? allItems
    : allItems.filter(i => i.status === filter);

  resultsEl.innerHTML = '';
  resultLayer.clearLayers();

  if (!items.length) {
    resultsEl.innerHTML = '<div class="card">Nic nenalezeno</div>';
    return;
  }

  for (const item of items) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);

    card.querySelector('.name').textContent = item.name;
    card.querySelector('.meta').textContent = `${item.status} • ${item.distanceKm} km`;
    card.querySelector('.summary').textContent =
      item.description_short || item.address || '';

    card.querySelector('.facts').innerHTML = [
      factRow('Postaveno', item.year_built),
      factRow('Dnes', item.current_use)
    ].join('');

    card.querySelector('.detail-btn').onclick = () => openDetail(item);

    resultsEl.appendChild(card);

    const marker = L.marker([item.lat, item.lon]).addTo(resultLayer);
    marker.on('click', () => openDetail(item));
  }
}

async function fetchNearby(position) {
  const { latitude, longitude } = position.coords;
  const radius = Number(radiusSelect.value);

  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([latitude, longitude]).addTo(map);

  setStatus('Načítám data…');

  const data = await loadSynagogues();

  allItems = data
    .filter(i => i.lat && i.lon)
    .map(i => {
      const d = getDistanceKm(latitude, longitude, i.lat, i.lon);
      return { ...i, distanceKm: d.toFixed(1) };
    })
    .filter(i => i.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  setStatus(`Nalezeno: ${allItems.length}`);
  renderResults();
}

function locateUser() {
  navigator.geolocation.getCurrentPosition(fetchNearby);
}

locateBtn.onclick = locateUser;
statusFilter.onchange = renderResults;
