<script lang="ts">
  import {
    countImportNodes,
    parseLinkSyncBackup,
    parseXbsBackup,
    XBS_DEFAULT_SERVICE,
    xbsToImportRoots,
    type ImportResult,
    type ImportRoots,
  } from '@linksync/core';
  import { onMount } from 'svelte';
  import { getLanguage, t } from '../../lib/i18n';
  import { send } from '../../lib/messages';
  import type { Status } from '../../lib/service';

  let status = $state<Status | null>(null);
  let busy = $state(false);

  // Sicherung einspielen
  let fileRoots = $state<ImportRoots | null>(null);
  let fileInfo = $state('');
  let fileReplace = $state(false);
  let fileMessage = $state<{ ok: boolean; text: string } | null>(null);

  // xBrowserSync
  let xbsServer = $state(XBS_DEFAULT_SERVICE);
  let xbsId = $state('');
  let xbsPassword = $state('');
  let xbsReplace = $state(false);
  let xbsMessage = $state<{ ok: boolean; text: string } | null>(null);

  let backupMessage = $state<{ ok: boolean; text: string } | null>(null);
  let connectMessage = $state<{ ok: boolean; text: string } | null>(null);

  onMount(() => {
    document.documentElement.lang = getLanguage();
    document.title = t('optionsTitle');
    void refresh();
  });

  async function refresh() {
    status = await send({ type: 'status' });
  }

  function done(result: ImportResult) {
    return { ok: true, text: t('importDone', { ...result }) };
  }

  function failed(err: unknown) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  }

  async function downloadBackup() {
    backupMessage = null;
    try {
      const backup = await send({ type: 'exportBackup' });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `linksync-backup-${backup.createdAt.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (err) {
      backupMessage = failed(err);
    }
  }

  async function chooseFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    fileRoots = null;
    fileInfo = '';
    fileMessage = null;
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      fileMessage = { ok: false, text: t('invalidJson') };
      return;
    }
    const linkSync = parseLinkSyncBackup(data);
    const xbs = linkSync ? null : parseXbsBackup(data);
    const roots = linkSync ?? (xbs ? xbsToImportRoots(xbs) : null);
    if (!roots) {
      fileMessage = { ok: false, text: t('unsupportedFile') };
      return;
    }
    const counts = countImportNodes(roots);
    fileRoots = roots;
    fileInfo = t('fileContains', { ...counts, format: linkSync ? 'LinkSync' : 'xBrowserSync' });
  }

  async function importFile() {
    if (!fileRoots) return;
    if (fileReplace && !confirm(t('replaceConfirm'))) return;
    busy = true;
    fileMessage = null;
    try {
      fileMessage = done(await send({ type: 'import', roots: $state.snapshot(fileRoots), replace: fileReplace }));
      await refresh();
    } catch (err) {
      fileMessage = failed(err);
    } finally {
      busy = false;
    }
  }

  async function importXbs(event: SubmitEvent) {
    event.preventDefault();
    if (xbsReplace && !confirm(t('replaceConfirm'))) return;
    busy = true;
    xbsMessage = null;
    try {
      xbsMessage = done(
        await send({ type: 'importXbs', serviceUrl: xbsServer, syncId: xbsId, password: xbsPassword, replace: xbsReplace }),
      );
      xbsPassword = '';
      await refresh();
    } catch (err) {
      xbsMessage = failed(err);
    } finally {
      busy = false;
    }
  }

  async function restoreConnectBackup() {
    busy = true;
    connectMessage = null;
    try {
      connectMessage = done(await send({ type: 'restoreConnectBackup' }));
      await refresh();
    } catch (err) {
      connectMessage = failed(err);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet modeChoice(name: string, replace: boolean, set: (value: boolean) => void)}
  <label class="choice">
    <input type="radio" {name} checked={!replace} onchange={() => set(false)} />
    {t('modeMerge')}
  </label>
  <label class="choice">
    <input type="radio" {name} checked={replace} onchange={() => set(true)} />
    {t('modeReplace')}
  </label>
{/snippet}

{#snippet feedback(message: { ok: boolean; text: string } | null)}
  {#if message}<p class={message.ok ? 'success' : 'error'} role="status">{message.text}</p>{/if}
{/snippet}

<main class="page">
  <header>
    <img src="/icon/48.png" alt="" width="28" height="28" />
    <h1>{t('optionsTitle')}</h1>
  </header>

  {#if status === null}
    <p class="muted">{t('loading')}</p>
  {:else if !status.configured}
    <p class="warning">{t('notConfigured')}</p>
  {:else}
    <section>
      <h2>{t('account')}</h2>
      <dl>
        <dt>{t('server')}</dt>
        <dd class="mono">{status.serverUrl}</dd>
        <dt>{t('syncId')}</dt>
        <dd class="mono">{status.syncId}</dd>
        <dt>{t('bookmarks')}</dt>
        <dd>{status.bookmarkCount}</dd>
      </dl>
    </section>

    <section>
      <h2>{t('backupTitle')}</h2>
      <p class="muted">{t('backupIntro')}</p>
      <div class="buttons"><button class="secondary" onclick={downloadBackup}>{t('backupDownload')}</button></div>
      {@render feedback(backupMessage)}
    </section>

    <section>
      <h2>{t('restoreTitle')}</h2>
      <p class="muted">{t('restoreIntro')}</p>
      <input type="file" accept=".json,.txt,application/json,text/plain" onchange={chooseFile} aria-label={t('chooseFile')} />
      {#if fileRoots}
        <p>{fileInfo}</p>
        {@render modeChoice('file-mode', fileReplace, (v) => (fileReplace = v))}
        <div class="buttons">
          <button class="primary" disabled={busy} onclick={importFile}>{busy ? t('pleaseWait') : t('importButton')}</button>
        </div>
      {/if}
      {@render feedback(fileMessage)}
    </section>

    <section>
      <h2>{t('xbsTitle')}</h2>
      <p class="muted">{t('xbsIntro')}</p>
      <form onsubmit={importXbs}>
        <label>{t('xbsServer')}<input type="url" bind:value={xbsServer} required /></label>
        <label>
          {t('xbsSyncId')}
          <input bind:value={xbsId} required spellcheck="false" placeholder="0123456789abcdef0123456789abcdef" />
        </label>
        <label>{t('xbsPassword')}<input type="password" bind:value={xbsPassword} required autocomplete="off" /></label>
        {@render modeChoice('xbs-mode', xbsReplace, (v) => (xbsReplace = v))}
        <div class="buttons">
          <button type="submit" class="primary" disabled={busy}>{busy ? t('pleaseWait') : t('importButton')}</button>
        </div>
      </form>
      <p class="hint">{t('xbsFileHint')}</p>
      {@render feedback(xbsMessage)}
    </section>

    {#if status.connectBackupAt}
      <section>
        <h2>{t('connectBackupTitle')}</h2>
        <p class="muted">
          {t('connectBackupIntro', { date: new Date(status.connectBackupAt).toLocaleString(getLanguage()) })}
        </p>
        <div class="buttons">
          <button class="secondary" disabled={busy} onclick={restoreConnectBackup}>{t('connectBackupButton')}</button>
        </div>
        {@render feedback(connectMessage)}
      </section>
    {/if}
  {/if}
</main>
