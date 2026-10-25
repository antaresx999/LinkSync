/**
 * Verbindung zum LinkSync-Server über HTTP.
 *
 * Wird von der Browser-Erweiterung und der App genutzt. In Tests lässt sich
 * statt des echten "fetch" eine eigene Funktion übergeben.
 */

import type { PullResponse, PushRequest, PushResponse, ServerInfo, SyncTransport } from './protocol';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** Sync-ID oder Passwort falsch (HTTP 401). */
export class AuthError extends ServerError {
  constructor(message = 'Sync-ID oder Passwort falsch') {
    super(401, message);
    this.name = 'AuthError';
  }
}

/** Server nicht erreichbar (kein Netz, falsche Adresse …). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Server nicht erreichbar', { cause });
    this.name = 'NetworkError';
  }
}

export class LinkSyncClient {
  private readonly baseUrl: string;

  constructor(
    serverUrl: string,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = serverUrl.replace(/\/+$/, '');
  }

  getInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('GET', '/v1/info');
  }

  async createAccount(syncId: string, authToken: string): Promise<void> {
    await this.request('POST', '/v1/accounts', authToken, { syncId });
  }

  async deleteAccount(syncId: string, authToken: string): Promise<void> {
    await this.request('DELETE', `/v1/accounts/${syncId}`, authToken);
  }

  /** Verbindung für den Sync-Ablauf eines Kontos. */
  transport(syncId: string, authToken: string, pageSize = 1000): SyncTransport {
    const path = `/v1/accounts/${encodeURIComponent(syncId)}/records`;
    return {
      pull: (since) => this.request<PullResponse>('GET', `${path}?since=${since}&limit=${pageSize}`, authToken),
      push: (request: PushRequest) => this.request<PushResponse>('POST', path, authToken, request),
    };
  }

  private async request<T>(method: string, path: string, authToken?: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetchFn(this.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new NetworkError(err);
    }

    if (response.status === 204) return undefined as T;
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
          ? data.error
          : `Serverfehler ${response.status}`;
      if (response.status === 401) throw new AuthError(message);
      throw new ServerError(response.status, message);
    }
    return data as T;
  }
}
