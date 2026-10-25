// Einstellungen für "pnpm firefox" (Mozilla web-ext).
// Startet Firefox mit einem frischen, temporären Testprofil – dein normales Profil bleibt unberührt.
// Beim Schliessen des Fensters wird das Testprofil samt Testkonto-Verbindung verworfen.
export default {
  sourceDir: '.output/firefox-mv3',
  run: {
    startUrl: ['about:blank'],
  },
};
