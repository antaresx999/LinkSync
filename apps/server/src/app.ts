/**
 * Die HTTP-Schnittstelle des Servers (siehe docs/PROTOKOLL.md).
 *
 * Der Server prüft nur Form und Grösse der Daten. Den Inhalt kann er nicht
 * lesen, weil alles auf den Geräten verschlüsselt wird.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import {
  MAX_PUSH_RECORDS,
  MAX_RECORD_DATA_LENGTH,
  PROTOCOL_VERSION,
  type PushRecord,
  type ServerInfo,
} from '@linksync/core';
import type { Config } from './config';
import { RecordLimitError, type Database } from './db';

export const SERVER_VERSION = '0.1.0';
const MAX_PULL_LIMIT = 1000;
const SYNC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,100}$/;
const AUTH_TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

type Env = { Variables: { syncId: string } };

export function createApp(db: Database, config: Config) {
  const app = new Hono<Env>();

  app.use('*', secureHeaders());
  // Erweiterungen und Apps rufen den Server von eigenen "Adressen" aus auf.
  app.use('/v1/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }));
  app.use('/v1/*', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => error(c, 413, 'Anfrage zu gross') }));

  app.get('/health', (c) => c.text('ok'));

  app.get('/v1/info', (c) => {
    const info: ServerInfo = {
      name: 'LinkSync',
      version: SERVER_VERSION,
      protocol: PROTOCOL_VERSION,
      allowNewAccounts: config.allowNewAccounts,
      maxRecordsPerAccount: config.maxRecordsPerAccount,
      message: config.message,
    };
    return c.json(info);
  });

  // Konto anlegen. Das Gerät schickt sein Anmelde-Token, der Server speichert nur den Hash.
  app.post('/v1/accounts', async (c) => {
    if (!config.allowNewAccounts) return error(c, 403, 'Dieser Server nimmt keine neuen Konten an');
    const token = bearerToken(c);
    if (!token) return error(c, 401, 'Anmelde-Token fehlt');
    const body = await readJson(c);
    const syncId = isObject(body) ? body.syncId : undefined;
    if (typeof syncId !== 'string' || !SYNC_ID.test(syncId)) return error(c, 400, 'Ungültige Sync-ID');
    if (!db.createAccount(syncId, hashToken(token))) return error(c, 409, 'Sync-ID existiert bereits');
    return c.json({ syncId }, 201);
  });

  // Ab hier: nur mit gültiger Anmeldung.
  app.use('/v1/accounts/:syncId', authenticate);
  app.use('/v1/accounts/:syncId/*', authenticate);

  async function authenticate(c: Context<Env>, next: () => Promise<void>) {
    const syncId = c.req.param('syncId') ?? '';
    const token = bearerToken(c);
    const account = SYNC_ID.test(syncId) ? db.getAccount(syncId) : undefined;
    // Gleiche Antwort für "Konto gibt es nicht" und "falsches Token": verrät nichts.
    if (!account || !token || !safeEqual(hashToken(token), account.authTokenHash)) {
      return error(c, 401, 'Sync-ID oder Passwort falsch');
    }
    c.set('syncId', syncId);
    await next();
  }

  app.delete('/v1/accounts/:syncId', (c) => {
    db.deleteAccount(c.get('syncId'));
    return c.body(null, 204);
  });

  app.get('/v1/accounts/:syncId/records', (c) => {
    const since = toNonNegativeInt(c.req.query('since') ?? '0');
    const limit = toNonNegativeInt(c.req.query('limit') ?? String(MAX_PULL_LIMIT));
    if (since === null || limit === null || limit === 0) return error(c, 400, 'Ungültige Parameter');
    const syncId = c.get('syncId');
    db.touchAccount(syncId);
    return c.json(db.pull(syncId, since, Math.min(limit, MAX_PULL_LIMIT)));
  });

  app.post('/v1/accounts/:syncId/records', async (c) => {
    const body = await readJson(c);
    const records = parsePushRecords(body);
    if (typeof records === 'string') return error(c, 400, records);
    const syncId = c.get('syncId');
    try {
      const result = db.push(syncId, records, config.maxRecordsPerAccount);
      db.touchAccount(syncId);
      return c.json(result);
    } catch (err) {
      if (err instanceof RecordLimitError) return error(c, 413, err.message);
      throw err;
    }
  });

  app.notFound((c) => error(c, 404, 'Nicht gefunden'));
  app.onError((err, c) => {
    console.error(err);
    return error(c, 500, 'Interner Fehler');
  });

  return app;
}

// ---------- Hilfsfunktionen ----------

function error(c: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 500, message: string) {
  return c.json({ error: message }, status);
}

function bearerToken(c: Context): string | null {
  const header = c.req.header('Authorization') ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  return match && AUTH_TOKEN.test(match[1]!) ? match[1]! : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Vergleich in konstanter Zeit, damit die Antwortzeit nichts über den Hash verrät. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function parsePushRecords(body: unknown): PushRecord[] | string {
  if (!isObject(body) || !Array.isArray(body.records)) return 'records fehlt';
  if (body.records.length > MAX_PUSH_RECORDS) return `Höchstens ${MAX_PUSH_RECORDS} Einträge pro Anfrage`;
  const seen = new Set<string>();
  const result: PushRecord[] = [];
  for (const r of body.records as unknown[]) {
    if (!isObject(r)) return 'Ungültiger Eintrag';
    const { id, baseSeq, data } = r;
    if (typeof id !== 'string' || !RECORD_ID.test(id)) return 'Ungültige Eintrags-ID';
    if (seen.has(id)) return `Eintrag ${id} doppelt`;
    if (typeof baseSeq !== 'number' || !Number.isSafeInteger(baseSeq) || baseSeq < 0) return 'Ungültige baseSeq';
    if (typeof data !== 'string' || data.length === 0 || data.length > MAX_RECORD_DATA_LENGTH) {
      return 'Ungültige oder zu grosse Daten';
    }
    seen.add(id);
    result.push({ id, baseSeq, data });
  }
  return result;
}

function toNonNegativeInt(value: string): number | null {
  if (!/^\d{1,15}$/.test(value)) return null;
  return Number(value);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
