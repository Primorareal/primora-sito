// Primora — build statico da Airtable (+ DeepL per IT->DE/EN sui campi vuoti)
// Node 18+ . Dipendenze: sharp.  Esegui:  node build.mjs
//
// Variabili d'ambiente richieste (NON mettere i segreti nel codice):
//   AIRTABLE_TOKEN   Personal Access Token Airtable (permesso: data.records:read sulla base)
//   AIRTABLE_BASE    ID della base, es. appXXXXXXXXXXXXXX
//   DEEPL_KEY        (opzionale) chiave DeepL API Free. Se assente, salta la traduzione.
//
// Output: cartella ./dist (index.html + images/ + file statici) pronta per il deploy.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// ----------------- CONFIG (adatta se hai rinominato tabelle/campi) -----------------
const BASE = process.env.AIRTABLE_BASE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const DEEPL_KEY = process.env.DEEPL_KEY || '';
const TABLES = { oggetti: 'Oggetti', annunci: 'Annunci', caratteristiche: 'Caratteristiche' };

const OUT = 'dist';
const IMG_DIR = path.join(OUT, 'images');
const STATIC_DIR = 'static';            // icon.svg, 404.html, robots.txt, sitemap.xml -> dist/
const STATIC_IMG_DIR = 'static-images'; // hero1..6.jpg, alessandra.jpg -> dist/images/

// Stati: una sola colonna IT in Airtable -> traduzioni fisse per il badge
const STATE_MAP = {
  'In vendita':    { de: 'Zum Verkauf',     en: 'For sale' },
  'In affitto':    { de: 'Zu vermieten',    en: 'For rent' },
  'In costruzione':{ de: 'Im Bau',          en: 'Under construction' },
  'Su progetto':   { de: 'Auf Projektbasis',en: 'Off-plan' },
  'Ultima unità':  { de: 'Letzte Einheit',  en: 'Last unit' },
};
const NOTA_MAP = { 'escl. posteggi': { de: 'exkl. Parkplätze', en: 'excl. parking' } };

if (!BASE || !TOKEN) { console.error('Mancano AIRTABLE_BASE o AIRTABLE_TOKEN'); process.exit(1); }

// ----------------- Airtable -----------------
async function airtableAll(table) {
  const out = []; let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`Airtable ${table}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}

// ----------------- DeepL -----------------
const transCache = new Map();
async function deepl(text, target) {
  if (!DEEPL_KEY || !text) return '';
  const key = target + '::' + text;
  if (transCache.has(key)) return transCache.get(key);
  const r = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text, source_lang: 'IT', target_lang: target.toUpperCase() })
  });
  if (!r.ok) { console.warn('DeepL warn', r.status); return ''; }
  const j = await r.json();
  const t = j.translations?.[0]?.text || '';
  transCache.set(key, t);
  return t;
}
// Oggetto multilingua: {it, de, en} con DeepL sui vuoti
async function ml(it, de, en) {
  it = (it || '').trim();
  de = (de || '').trim() || await deepl(it, 'DE');
  en = (en || '').trim() || await deepl(it, 'EN');
  return { it, de: de || it, en: en || it };
}

// ----------------- Immagini -----------------
function attUrls(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(a => (typeof a === 'string' ? a : a.url)).filter(Boolean);
  if (typeof v === 'string') return v.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  return [];
}
async function saveImg(url, name) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('img ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const img = sharp(buf).rotate();
  const meta = await img.metadata();
  const m = Math.max(meta.width || 0, meta.height || 0);
  const pipe = m > 1600 ? img.resize({ width: meta.width >= meta.height ? 1600 : null, height: meta.height > meta.width ? 1600 : null }) : img;
  await pipe.jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(IMG_DIR, name));
  return 'images/' + name;
}

// ----------------- Build -----------------
function clsFor(deal, stato) {
  if (deal === 'rent') return 'rent';
  if (/progetto|costruzione|ultima/i.test(stato || '')) return 'soon';
  return 'sale';
}
function localizePrice(s) {
  s = (s || '').trim(); if (!s) return null;
  return { it: s, de: s.replace('/mese', '/Monat'), en: s.replace('/mese', '/month') };
}

async function run() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  // Caratteristiche: mappe per nome IT e per record id
  const caratt = await airtableAll(TABLES.caratteristiche);
  const byName = new Map(), byId = new Map();
  for (const r of caratt) {
    const f = r.fields;
    const o = { it: f.Nome_IT || '', de: f.Nome_DE || '', en: f.Nome_EN || '' };
    if (o.it) byName.set(o.it, o);
    byId.set(r.id, o);
  }
  async function featList(v) {
    let items = [];
    if (Array.isArray(v)) {
      for (const el of v) {
        if (typeof el === 'string' && el.startsWith('rec') && byId.has(el)) items.push(byId.get(el));
        else { const nm = String(el).trim(); items.push(byName.get(nm) || await ml(nm)); }
      }
    } else if (typeof v === 'string') {
      for (const nm of v.split(',').map(s => s.trim()).filter(Boolean))
        items.push(byName.get(nm) || await ml(nm));
    }
    return { it: items.map(x => x.it), de: items.map(x => x.de || x.it), en: items.map(x => x.en || x.it) };
  }

  // Oggetti
  const orec = (await airtableAll(TABLES.oggetti))
    .filter(r => r.fields.Pubblicato)
    .sort((a, b) => (a.fields.Ordine || 0) - (b.fields.Ordine || 0));
  const objects = [];
  for (const r of orec) {
    const f = r.fields;
    const deal = (f.Tipo === 'Affitto') ? 'rent' : 'sale';
    const stato = f.Stato || (deal === 'rent' ? 'In affitto' : 'In vendita');
    const st = STATE_MAP[stato] || {};
    // foto
    const urls = attUrls(f.Foto);
    const gallery = [];
    for (let i = 0; i < urls.length; i++) {
      try { gallery.push(await saveImg(urls[i], `${(f.Riferimento||'obj')}-${i+1}.jpg`)); }
      catch (e) { console.warn('foto skip', f.Riferimento, i, e.message); }
    }
    const o = {
      ref: f.Riferimento || '', deal, cls: clsFor(deal, stato),
      loc: f.Localita || '', npa: f.NPA || '', rooms: f.Locali || '', surf: f.Superficie_m2 || '',
      state: { it: stato, de: st.de || stato, en: st.en || stato },
      category: await ml(f.Categoria_IT, f.Categoria_DE, f.Categoria_EN),
      avail: await ml(f.Disponibilita_IT, f.Disponibilita_DE, f.Disponibilita_EN),
      posti: await ml(f.Posteggi_IT, f.Posteggi_DE, f.Posteggi_EN),
      t: await ml(f.Titolo_IT, f.Titolo_DE, f.Titolo_EN),
      x: await ml(f.Teaser_IT, f.Teaser_DE, f.Teaser_EN),
      long: await ml(f.Descrizione_IT, f.Descrizione_DE, f.Descrizione_EN),
      features: await featList(f.Caratteristiche),
      gallery
    };
    if ((f.Piano_IT || '').trim()) o.floor = await ml(f.Piano_IT, f.Piano_DE, f.Piano_EN);
    if (deal === 'rent') {
      o.price = localizePrice(f.Pigione_lorda);
      o.netRent = localizePrice(f.Pigione_netta);
      o.charges = localizePrice(f.Spese);
      const nota = (f.Nota_prezzo || '').trim();
      if (nota) { const nm = NOTA_MAP[nota] || { de: nota, en: nota };
        o.gross = { it: `${f.Pigione_lorda} (${nota})`, de: `${f.Pigione_lorda.replace('/mese','/Monat')} (${nm.de})`, en: `${f.Pigione_lorda.replace('/mese','/month')} (${nm.en})` }; }
    } else {
      o.price = f.Prezzo_vendita || '';
    }
    objects.push(o);
  }

  // Annunci (bacheca)
  const arec = (await airtableAll(TABLES.annunci))
    .filter(r => r.fields.Pubblicato)
    .sort((a, b) => (a.fields.Ordine || 0) - (b.fields.Ordine || 0));
  const news = [];
  const excerpt = s => { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > 150 ? s.slice(0, 147).replace(/\s\S*$/, '') + '…' : s; };
  for (const r of arec) {
    const f = r.fields;
    const body = await ml(f.Testo_IT, f.Testo_DE, f.Testo_EN);
    news.push({
      date: await ml(f.Data_IT, f.Data_DE, f.Data_EN),
      badge: await ml(f.Badge_IT, f.Badge_DE, f.Badge_EN),
      t: await ml(f.Titolo_IT, f.Titolo_DE, f.Titolo_EN),
      x: { it: excerpt(body.it), de: excerpt(body.de), en: excerpt(body.en) },
      body
    });
  }

  // Inietta nel template
  let html = fs.readFileSync('template.html', 'utf8');
  const safe = v => JSON.stringify(v).replace(/<\//g, '<\\/'); // evita chiusure </script> dentro i dati
  html = html.replace('__OBJECTS__', safe(objects)).replace('__NEWS__', safe(news));
  fs.writeFileSync(path.join(OUT, 'index.html'), html);

  // File statici (icon, 404, robots, sitemap) -> dist/
  if (fs.existsSync(STATIC_DIR))
    for (const s of fs.readdirSync(STATIC_DIR)) fs.copyFileSync(path.join(STATIC_DIR, s), path.join(OUT, s));
  // Immagini fisse del sito (hero, team) -> dist/images/
  if (fs.existsSync(STATIC_IMG_DIR))
    for (const s of fs.readdirSync(STATIC_IMG_DIR)) fs.copyFileSync(path.join(STATIC_IMG_DIR, s), path.join(IMG_DIR, s));

  console.log(`OK: ${objects.length} oggetti, ${news.length} annunci, immagini in ${IMG_DIR}`);
}
run().catch(e => { console.error(e); process.exit(1); });
