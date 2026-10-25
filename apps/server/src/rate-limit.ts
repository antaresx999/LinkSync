/**
 * Einfache Begrenzung: höchstens "limit" Vorgänge pro Zeitfenster und Schlüssel
 * (z. B. pro IP-Adresse). Läuft im Arbeitsspeicher – für einen einzelnen
 * Server-Prozess genau richtig.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private lastCleanup = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Gibt 0 zurück, wenn erlaubt – sonst die Sekunden bis zum nächsten Versuch. */
  hit(key: string): number {
    if (this.limit <= 0) return 0; // 0 = keine Begrenzung
    const now = this.now();
    this.cleanup(now);
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    if (window.count >= this.limit) return Math.ceil((window.resetAt - now) / 1000);
    window.count++;
    return 0;
  }

  /** Abgelaufene Einträge gelegentlich entfernen, damit der Speicher nicht wächst. */
  private cleanup(now: number) {
    if (now - this.lastCleanup < this.windowMs) return;
    this.lastCleanup = now;
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}
