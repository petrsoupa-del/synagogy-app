import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function buildOverpassQuery(lat, lon, radius) {
  return `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lon})["amenity"="place_of_worship"]["religion"="jewish"];
      way(around:${radius},${lat},${lon})["amenity"="place_of_worship"]["religion"="jewish"];
      relation(around:${radius},${lat},${lon})["amenity"="place_of_worship"]["religion"="jewish"];

      node(around:${radius},${lat},${lon})["building"="synagogue"];
      way(around:${radius},${lat},${lon})["building"="synagogue"];
      relation(around:${radius},${lat},${lon})["building"="synagogue"];

      node(around:${radius},${lat},${lon})["historic"="synagogue"];
      way(around:${radius},${lat},${lon})["historic"="synagogue"];
      relation(around:${radius},${lat},${lon})["historic"="synagogue"];
    );
    out center tags;
  `;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyStatus(tags = {}) {
  const disused = tags.disused === 'yes' || tags.abandoned === 'yes' || tags.ruins === 'yes';
  const former = tags.former_use === 'synagogue' || tags['disused:amenity'] === 'place_of_worship';
  const current = tags.amenity === 'place_of_worship' && tags.religion === 'jewish';

  if (current) return 'současná';
  if (former || disused || tags.building === 'synagogue' || tags.historic === 'synagogue') return 'bývalá / historická';
  return 'neurčeno';
}

function extractCurrentUse(tags = {}) {
  return (
    tags.current_use ||
    tags['building:use'] ||
    tags.shop ||
    tags.office ||
    tags.amenity ||
    tags.tourism ||
    tags.leisure ||
    ''
  );
}

function normalizeElement(el, userLat, userLon) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const tags = el.tags || {};
  const distanceKm = lat && lon ? haversineKm(userLat, userLon, lat, lon) : null;

  return {
    id: `${el.type}/${el.id}`,
    osmType: el.type,
    osmId: el.id,
    lat,
    lon,
    name: tags.name || tags['name:en'] || 'Neznámá synagoga',
    address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' '),
    status: classifyStatus(tags),
    currentUse: extractCurrentUse(tags),
    yearBuilt: tags.start_date || tags['building:start_date'] || '',
    architect: tags.architect || '',
    wikidata: tags.wikidata || '',
    wikipedia: tags.wikipedia || '',
    image: tags.image || '',
    tags,
    distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(2))
  };
}

function getClaimValue(claim) {
  const val = claim?.mainsnak?.datavalue?.value;
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val.id) return val.id;
  if (val.text) return val.text;
  if (val.time) return val.time;
  return '';
}

async function fetchWikidataDetails(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SynagogueNearMe/0.1 (educational demo)'
    }
  });
  if (!res.ok) {
    throw new Error(`Wikidata failed: ${res.status}`);
  }
  const data = await res.json();
  const entity = data.entities?.[qid];
  if (!entity) return null;

  const labels = entity.labels || {};
  const descriptions = entity.descriptions || {};
  const claims = entity.claims || {};
  const sitelinks = entity.sitelinks || {};

  const wikipediaUrl = sitelinks.cswiki
    ? `https://cs.wikipedia.org/wiki/${encodeURIComponent(sitelinks.cswiki.title.replace(/ /g, '_'))}`
    : sitelinks.enwiki
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(sitelinks.enwiki.title.replace(/ /g, '_'))}`
      : '';

  return {
    qid,
    label: labels.cs?.value || labels.en?.value || qid,
    description: descriptions.cs?.value || descriptions.en?.value || '',
    inception: getClaimValue(claims.P571?.[0]),
    architectQid: getClaimValue(claims.P84?.[0]),
    currentUseQid: getClaimValue(claims.P366?.[0]),
    heritageQid: getClaimValue(claims.P1435?.[0]),
    wikipediaUrl
  };
}

async function fetchWikipediaSummary(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/wiki/');
    const title = parts[1];
    if (!title) return '';
    const apiBase = u.hostname.startsWith('cs.')
      ? 'https://cs.wikipedia.org/api/rest_v1/page/summary/'
      : 'https://en.wikipedia.org/api/rest_v1/page/summary/';
    const res = await fetch(apiBase + title, {
      headers: { 'User-Agent': 'SynagogueNearMe/0.1 (educational demo)' }
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.extract || '';
  } catch {
    return '';
  }
}

app.get('/api/nearby', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Math.min(Number(req.query.radius || 10000), 30000);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Neplatné souřadnice.' });
  }

  try {
    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: buildOverpassQuery(lat, lon, radius)
    });

    if (!overpassRes.ok) {
      throw new Error(`Overpass failed: ${overpassRes.status}`);
    }

    const data = await overpassRes.json();
    const unique = new Map();
    for (const el of data.elements || []) {
      const normalized = normalizeElement(el, lat, lon);
      if (!normalized.lat || !normalized.lon) continue;
      if (!unique.has(normalized.id)) unique.set(normalized.id, normalized);
    }

    const items = [...unique.values()]
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
      .slice(0, 100);

    res.json({ count: items.length, items });
  } catch (error) {
    res.status(500).json({ error: 'Nepodařilo se stáhnout data o synagogách.', detail: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'synagogue-near-me' });
});

app.get('/api/details', async (req, res) => {
  const { wikidata, wikipedia, yearBuilt, architect, currentUse, name, status } = req.query;

  try {
    let wiki = null;
    if (wikidata) {
      wiki = await fetchWikidataDetails(String(wikidata));
    }
    const summary = await fetchWikipediaSummary(wiki?.wikipediaUrl || String(wikipedia || ''));
    res.json({
      name: String(name || ''),
      status: String(status || ''),
      yearBuilt: wiki?.inception || String(yearBuilt || ''),
      architect: String(architect || ''),
      currentUse: String(currentUse || ''),
      wikidata: wiki,
      summary
    });
  } catch (error) {
    res.status(500).json({ error: 'Nepodařilo se stáhnout detail objektu.', detail: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Synagogue Near Me app running on http://localhost:${PORT}`);
});
