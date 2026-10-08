# Primora — Build da Airtable

Genera il sito statico (`dist/`) leggendo i contenuti da **Airtable**, riempiendo i campi
**DE/EN vuoti con DeepL**, scaricando e ottimizzando le **foto**. Il frontend resta identico.

```
Airtable (contenuti)  →  build.mjs  →  dist/  →  deploy (Netlify / Cloudflare)
```

## Contenuto della cartella
- `build.mjs` — lo script di build.
- `template.html` — il sito, con i segnaposto `__OBJECTS__` e `__NEWS__` (riempiti dal build).
- `static/` — file copiati così come sono in `dist/` (icon.svg, 404.html, robots.txt, sitemap.xml).
- `static-images/` — immagini NON gestite da Airtable (hero della home, foto team) → `dist/images/`.
- `.github/workflows/deploy.yml` — build + deploy automatici (GitHub Actions).

## Variabili d'ambiente (segreti — NON nel codice)
| Nome | Cosa | Dove si prende |
|---|---|---|
| `AIRTABLE_BASE` | ID della base, es. `appXXXXXXXXXXXXXX` | URL/API della base (airtable.com/api) |
| `AIRTABLE_TOKEN` | Personal Access Token (scope: `data.records:read` sulla base) | Airtable → Account → Builder hub → Personal access tokens |
| `DEEPL_KEY` | (opzionale) chiave DeepL API Free | dashboard DeepL |

> Senza `DEEPL_KEY` il build funziona lo stesso: usa ciò che c'è in Airtable e il sito fa fallback all'italiano.

## Test in locale
```bash
npm install
AIRTABLE_BASE=appXXXX AIRTABLE_TOKEN=xxx DEEPL_KEY=yyy node build.mjs
# risultato in ./dist  — apri dist/index.html
```

## Se hai rinominato tabelle/campi
In cima a `build.mjs`, nella sezione **CONFIG**, aggiorna `TABLES` (nomi tabelle).
I nomi delle colonne devono combaciare con quelli dei CSV importati (Titolo_IT, Foto, ecc.).

## Deploy automatico (consigliato: GitHub Actions → Netlify)
1. Crea un repo GitHub con questa cartella.
2. Repo → **Settings → Secrets and variables → Actions**: aggiungi
   `AIRTABLE_BASE`, `AIRTABLE_TOKEN`, `DEEPL_KEY`, `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN`.
   - `NETLIFY_SITE_ID`: Netlify → Site configuration → Site ID.
   - `NETLIFY_AUTH_TOKEN`: Netlify → User settings → Applications → Personal access token.
3. Il workflow `deploy.yml` fa build + deploy. Si avvia:
   - **a mano** (tab Actions → Run workflow),
   - **ogni ora** (schedule, opzionale — si può togliere),
   - **a comando** via webhook `repository_dispatch` tipo `publish` (vedi sotto).

### Bottone "Pubblica" in Airtable (senza piani a pagamento)
Aggiungi in Airtable un campo **Button** con azione *Open URL* che punta a un piccolo URL
`repository_dispatch` di GitHub — oppure, più semplice, usa un **deploy hook** del provider
(Netlify/Cloudflare) e colleghi il workflow al push. Te lo configuro io quando ci siamo.

## In alternativa: Cloudflare Pages / Netlify "build nativo"
Imposta come **build command** `npm install && node build.mjs` e **output directory** `dist`,
con le stesse variabili d'ambiente nel pannello. Il provider fa tutto lui.
