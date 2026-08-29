// pwa.js — two lines of plumbing, kept out of the app so either page can include it.
// Add to any page with:  <link rel="manifest" href="./manifest.webmanifest">
//                        <script src="./pwa.js"></script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(r => console.log('[pwa] service worker registered, scope', r.scope))
      .catch(e => console.warn('[pwa] registration failed:', e.message));
  });
}
