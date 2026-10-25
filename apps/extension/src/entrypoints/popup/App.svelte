<script lang="ts">
  import { onMount } from 'svelte';
  import { send } from '../../lib/messages';
  import type { Status } from '../../lib/service';

  const DEFAULT_SERVER = 'http://localhost:8080';

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

  onMount(() => {
    void run({ type: 'status' });
  });

  async function run(request: Parameters<typeof send>[0]) {
    busy = true;
    error = '';
    try {
      status = await send(request);
      password = '';
      password2 = '';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (!status) status = { configured: false };
    } finally {
      busy = false;
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (mode === 'create') {
      if (password.length < 10) return void (error = 'Das Passwort muss mindestens 10 Zeichen lang sein.');
      if (password !== password2) return void (error = 'Die Passwörter stimmen nicht überein.');
      void run({ type: 'create', serverUrl, password });
    } else {
      void run({ type: 'connect', serverUrl, syncId, password });
    }
  }

  function disconnect() {
    if (confirm('Verbindung trennen? Die Lesezeichen in diesem Browser bleiben erhalten.')) {
      void run({ type: 'disconnect' });
    }
  }

  async function copySyncId(id: string) {
    await navigator.clipboard.writeText(id);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function formatTime(ms: number | null): string {
    if (!ms) return 'noch nie';
    const seconds = Math.round((Date.now() - ms) / 1000);
    if (seconds < 60) return 'gerade eben';
    if (seconds < 3600) return `vor ${Math.round(seconds / 60)} Min.`;
    return new Date(ms).toLocaleString('de-CH');
  }
</script>

<main>
  <header>
    <img src="/icon/48.png" alt="" width="24" height="24" />
    <h1>LinkSync</h1>
  </header>

  {#if status === null}
    <p class="muted">Lädt …</p>
  {:else if !status.configured}
    <div class="tabs" role="tablist">
      <button role="tab" class:active={mode === 'create'} aria-selected={mode === 'create'} onclick={() => (mode = 'create')}>
        Neues Konto
      </button>
      <button role="tab" class:active={mode === 'connect'} aria-selected={mode === 'connect'} onclick={() => (mode = 'connect')}>
        Verbinden
      </button>
    </div>

    <form onsubmit={submit}>
      {#if mode === 'create'}
        <p class="muted">Lädt die Lesezeichen dieses Browsers verschlüsselt auf den Server.</p>
      {:else}
        <p class="warning">Die Lesezeichen in diesem Browser werden durch die synchronisierten ersetzt.</p>
      {/if}

      <label>
        Server
        <input type="url" bind:value={serverUrl} required />
      </label>

      {#if mode === 'connect'}
        <label>
          Sync-ID
          <input bind:value={syncId} required placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx" spellcheck="false" />
        </label>
      {/if}

      <label>
        Passwort
        <input type="password" bind:value={password} required autocomplete={mode === 'create' ? 'new-password' : 'current-password'} />
      </label>

      {#if mode === 'create'}
        <label>
          Passwort wiederholen
          <input type="password" bind:value={password2} required autocomplete="new-password" />
        </label>
        <p class="hint">
          Merke dir das Passwort gut. Es verlässt nie dein Gerät – ohne es sind deine Lesezeichen nicht wiederherstellbar.
        </p>
      {/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <button type="submit" class="primary" disabled={busy}>
        {#if busy}Bitte warten …{:else if mode === 'create'}Konto anlegen{:else}Verbinden{/if}
      </button>
    </form>
  {:else}
    <section class="status">
      <div class="row">
        <span class="dot" class:ok={!status.lastError} class:bad={!!status.lastError}></span>
        <span>{status.lastError ? 'Problem beim Synchronisieren' : 'Synchronisiert'}</span>
      </div>
      <dl>
        <dt>Letzter Sync</dt>
        <dd>{formatTime(status.lastSyncAt)}</dd>
        <dt>Lesezeichen</dt>
        <dd>{status.bookmarkCount}</dd>
        <dt>Server</dt>
        <dd class="mono">{status.serverUrl}</dd>
        <dt>Sync-ID</dt>
        <dd class="mono syncid">
          <span>{status.syncId}</span>
          <button class="link" onclick={() => status?.configured && copySyncId(status.syncId)}>
            {copied ? 'Kopiert ✓' : 'Kopieren'}
          </button>
        </dd>
      </dl>
      <p class="hint">Mit Sync-ID und Passwort verbindest du weitere Browser.</p>

      {#if status.lastError}<p class="error" role="alert">{status.lastError}</p>{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <button class="primary" disabled={busy} onclick={() => run({ type: 'sync' })}>
        {busy ? 'Synchronisiere …' : 'Jetzt synchronisieren'}
      </button>
      <button class="secondary" disabled={busy} onclick={disconnect}>Verbindung trennen</button>
    </section>
  {/if}
</main>
