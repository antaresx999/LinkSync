import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// Nur für den automatischen Firefox-Test: eigener Ausgabeordner, Popup öffnet sich nach der Installation.
const e2e = process.env.WXT_E2E === '1';

// Konfiguration der Erweiterung. Doku: https://wxt.dev
export default defineConfig({
  srcDir: 'src',
  ...(e2e ? { outDirTemplate: '{{browser}}-mv{{manifestVersion}}-e2e' } : {}),
  modules: ['@wxt-dev/module-svelte'],
  // Pakete für die Stores. Mozilla verlangt zusätzlich den Quellcode – inklusive des gemeinsamen Kerns.
  zip: {
    artifactTemplate: 'linksync-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'linksync-{{version}}-sources.zip',
    sourcesRoot: resolve(import.meta.dirname, '../..'),
    includeSources: [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      'LICENSE',
      'README.md',
      'packages/core/**',
      'apps/extension/**',
    ],
    excludeSources: ['**/node_modules/**', '**/.output/**', '**/.wxt/**', '**/e2e/screenshots/**', '**/*.env*'],
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['bookmarks', 'storage', 'unlimitedStorage', 'alarms'],
    // Eigene Sicherheitsrichtlinie: Firefox würde sonst jede http://-Adresse auf https:// umschreiben
    // ("upgrade-insecure-requests") – Server im Heimnetz ohne HTTPS wären dann nicht erreichbar.
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self';" },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'linksync@antaresx999.github.io',
              strict_min_version: '115.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
