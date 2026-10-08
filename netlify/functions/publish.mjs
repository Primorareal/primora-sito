// Netlify Function — "Pubblica": avvia un nuovo build via Build Hook.
// Percorso nel repo: netlify/functions/publish.mjs
// Variabili d'ambiente richieste su Netlify:
//   BUILD_HOOK_URL  = l'URL del Build hook (Netlify → Build & deploy → Build hooks)
//   PUBLISH_KEY     = una parola segreta a tua scelta (es. primora2026)
//
// Uso dal bottone Airtable (Open URL):
//   https://primoragroup.ch/.netlify/functions/publish?k=LA_TUA_CHIAVE

export default async (req) => {
  const url = new URL(req.url);
  const k = url.searchParams.get('k');
  if (process.env.PUBLISH_KEY && k !== process.env.PUBLISH_KEY) {
    return new Response('Non autorizzato', { status: 401 });
  }
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) return new Response('BUILD_HOOK_URL non configurato', { status: 500 });

  await fetch(hook, { method: 'POST' });

  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pubblicazione avviata</title></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f6f1e9;color:#2c2823;text-align:center;padding:60px 20px">
<p style="letter-spacing:.2em;text-transform:uppercase;font-size:.8rem;color:#9c7b4e">Primora</p>
<h2>Pubblicazione avviata ✅</h2>
<p>Il sito si aggiorna tra 1–2 minuti. Puoi chiudere questa scheda.</p>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
