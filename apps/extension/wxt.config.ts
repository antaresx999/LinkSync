import { defineConfig } from 'wxt';

// Nur für den automatischen Firefox-Test: Popup von normalen Seiten aus erreichbar machen.
const e2e = process.env.WXT_E2E === '1';

// Konfiguration der Erweiterung. Doku: https://wxt.dev
export default defineConfig({
  srcDir: 'src',
  ...(e2e ? { outDirTemplate: '{{browser}}-mv{{manifestVersion}}-e2e' } : {}),
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'LinkSync',
    description: 'Ende-zu-Ende verschlüsselter Lesezeichen-Sync für alle Browser.',
    permissions: ['bookmarks', 'storage', 'unlimitedStorage', 'alarms'],
    browser_specific_settings: {
      gecko: {
        id: 'linksync@antaresx999.github.io',
        strict_min_version: '115.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
