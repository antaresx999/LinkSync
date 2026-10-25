<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { getLanguage, t } from '../../lib/i18n';
  import { send } from '../../lib/messages';
  import type { SearchResult, Status } from '../../lib/service';

  // Standard-Server: beim Bauen über WXT_DEFAULT_SERVER festlegbar (siehe docs/FIREFOX-ADDONS.md).
  const DEFAULT_SERVER: string = import.meta.env.WXT_DEFAULT_SERVER || 'http://localhost:8080';

  let status = $state<Status | null>(null);
  let busy = $state(false);
  let error = $state('');
  let copied = $state(false);

  // Einrichten
  let mode = $state<'create' | 'connect'>('create');
  let serverUrl = $state(DEFAULT_SERVER);
  let syncId = $state('');
  let password = $state('');
  let password2 = $state('');

  // Suche
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let selected = $state(0);
  /** Suchbegriff, zu dem die angezeigten Treffer gehören. */
  let searchedFor = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    document.documentElement.lang = getLanguage();
    void load();
  });

  async function load() {
    try {
      status = await send({ type: 'status' });
    } catch (err) {
      error = message(err);
      status = { configured: false };
    }
  }

  async function act(task: () => Promise<Status>) {
    busy = true;
    error = '';
    try {
      status = await task();
      password = '';
      password2 = '';
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (mode === 'create') {
      if (password.length < 10) return void (error = t('passwordTooShort'));
      if (password !== password2) return void (error = t('passwordMismatch'));
      void act(() => send({ type: 'create', serverUrl, password }));
    } else {
      void act(() => send({ type: 'connect', serverUrl, syncId, password }));
    }
  }

  function disconnect() {
    if (confirm(t('disconnectConfirm'))) void act(() => send({ type: 'disconnect' }));
  }

  async function copySyncId(id: string) {
    await navigator.clipboard.writeText(id);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const current = query.trim();
      const found = current ? await send({ type: 'search', query: current }) : [];
      if (current !== query.trim()) return; // inzwischen weitergetippt
      results = found;
      searchedFor = current;
      selected = 0;
    }, 120);
  }

  function onSearchKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') selected = Math.min(selected + 1, results.length - 1);
    else if (event.key === 'ArrowUp') selected = Math.max(selected - 1, 0);
    else if (event.key === 'Enter') {
      const hit = results[selected];
      if (hit) open(hit.url, event);
    } else return;
    event.preventDefault();
  }

  function open(url: string, event: Event) {
    event.preventDefault();
    void browser.tabs.create({ url }).then(() => window.close());
  }

  function openSettings() {
    void browser.runtime.openOptionsPage().then(() => window.close());
  }

  function hostOf(url: string) {
    try {
      return new URL(url).host || url;
    } catch {
      return url;
    }
  }

  function formatTime(ms: number | null): string {
    if (!ms) return t('never');
    const seconds = Math.round((Date.now() - ms) / 1000);
    if (seconds < 60) return t('justNow');
    if (seconds < 3600) return t('minutesAgo', { n: Math.round(seconds / 60) });
    return new Date(ms).toLocaleString(getLanguage());
  }

  function message(err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
</script>

<main aria-busy={busy} data-last-sync={status?.configured ? status.lastSyncAt : ''}>
  <header>
    <img src="/icon/48.png" alt="" width="24" height="24" />
    <h1>{t('appName')}</h1>
  </header>

  {#if status === null}
    <p class="muted">{t('loading')}</p>
  {:else if !status.configured}
    <div class="tabs" role="tablist">
      <button role="tab" class:active={mode === 'create'} aria-selected={mode === 'create'} onclick={() => (mode = 'create')}>
        {t('tabCreate')}
      </button>
      <button role="tab" class:active={mode === 'connect'} aria-selected={mode === 'connect'} onclick={() => (mode = 'connect')}>
        {t('tabConnect')}
      </button>
    </div>

    <form onsubmit={submit}>
      {#if mode === 'create'}
        <p class="muted">{t('createIntro')}</p>
      {:else}
        <p class="warning">{t('connectWarning')}</p>
      {/if}

      <label>
        {t('server')}
        <input type="url" bind:value={serverUrl} required />
      </label>

      {#if mode === 'connect'}
        <label>
          {t('syncId')}
          <input bind:value={syncId} required placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx" spellcheck="false" />
        </label>
      {/if}

      <label>
        {t('password')}
        <input type="password" bind:value={password} required autocomplete={mode === 'create' ? 'new-password' : 'current-password'} />
      </label>

      {#if mode === 'create'}
        <label>
          {t('passwordRepeat')}
          <input type="password" bind:value={password2} required autocomplete="new-password" />
        </label>
        <p class="hint">{t('passwordHint')}</p>
      {/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <button type="submit" class="primary" disabled={busy}>
        {busy ? t('pleaseWait') : mode === 'create' ? t('createButton') : t('connectButton')}
      </button>
    </form>
  {:else}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="search"
      type="search"
      placeholder={t('searchPlaceholder')}
      bind:value={query}
      oninput={onSearchInput}
      onkeydown={onSearchKey}
      autofocus
      aria-label={t('searchPlaceholder')}
    />

    {#if query.trim()}
      <ul class="results" role="listbox">
        {#each results as result, i (result.id)}
          <li role="option" aria-selected={i === selected}>
            <a href={result.url} class:selected={i === selected} onclick={(e) => open(result.url, e)} onmouseenter={() => (selected = i)}>
              <span class="title">{result.title || result.url}</span>
              <span class="sub">{[...result.path, hostOf(result.url)].join(' › ')}</span>
            </a>
          </li>
        {:else}
          {#if searchedFor === query.trim()}<li class="muted empty">{t('searchNoResults')}</li>{/if}
        {/each}
      </ul>
    {:else}
      <section class="status">
        <div class="row">
          <span class="dot" class:ok={!status.lastError} class:bad={!!status.lastError}></span>
          <span>{status.lastError ? t('statusError') : t('statusOk')}</span>
        </div>
        <dl>
          <dt>{t('lastSync')}</dt>
          <dd>{formatTime(status.lastSyncAt)}</dd>
          <dt>{t('bookmarks')}</dt>
          <dd>{status.bookmarkCount}</dd>
          <dt>{t('server')}</dt>
          <dd class="mono">{status.serverUrl}</dd>
          <dt>{t('syncId')}</dt>
          <dd class="mono syncid">
            <span>{status.syncId}</span>
            <button class="link" onclick={() => status?.configured && copySyncId(status.syncId)}>
              {copied ? t('copied') : t('copy')}
            </button>
          </dd>
        </dl>
        <p class="hint">{t('connectHint')}</p>

        {#if status.lastError}<p class="error" role="alert">{status.lastError}</p>{/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}

        <button class="primary" disabled={busy} onclick={() => act(() => send({ type: 'sync' }))}>
          {busy ? t('syncing') : t('syncNow')}
        </button>
        <div class="actions">
          <button class="link" onclick={openSettings}>{t('settings')}</button>
          <button class="link danger" disabled={busy} onclick={disconnect}>{t('disconnect')}</button>
        </div>
      </section>
    {/if}
  {/if}
</main>
